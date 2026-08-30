// The single authoritative path that turns a Paystack payment into a
// finished Abonten purchase. Both the client-triggered verify action
// (src/actions/verifyPaystackPayment.ts, optimistic fast path right after
// the Paystack popup closes) and the webhook
// (src/app/api/paystack/webhook/route.ts, the authoritative source of
// truth) call this exact function — neither path duplicates the other's
// logic, and neither ever marks a purchase successful without an
// independent Paystack verification.
//
// Deliberately NOT a "use server" Server Action: it takes an
// already-constructed Supabase client (cookie-bound for the frontend path,
// service-role for the webhook) and a payment_attempt id already resolved
// by the caller — same category as ticketInventory.ts/paymentAttempt.ts.

import activateEventPromotion from "@/actions/activateEventPromotion";
import activatePlacePromotion from "@/actions/activatePlacePromotion";
import generateTicket from "@/actions/generateTicket";
import { verifyTransaction } from "@/services/paystackService";
import { logger } from "@/utils/logger";
import { fromPesewas, toPesewas } from "@/utils/paystackAmount";
import type { SupabaseClient } from "@supabase/supabase-js";

type PaymentAttemptFullRow = {
  id: string;
  user_id: string;
  status: string;
  amount: number;
  currency: string;
  provider_reference: string | null;
  payment_group_id: string | null;
  checkout_session_id: string | null;
  place_promotion_checkout_id: string | null;
  event_promotion_checkout_id: string | null;
  transaction_id: string | null;
};

export type FinalizeResult =
  | { status: "succeeded" }
  | { status: "pending"; message: string }
  | { status: "failed"; message: string }
  // Payment was verified successful (a `transaction` row exists) but
  // issuing the purchased thing (ticket/promotion) failed afterward —
  // distinct from "failed" so callers never treat this as a
  // declined/failed charge and never suggest paying again. Retryable via
  // the same payment_attempt id (see the CAS lock below and
  // retryPaymentFulfillment.ts).
  | { status: "fulfillment_failed"; message: string; paymentAttemptId: string }
  | { status: "already_processing" }
  | { status: "not_found" };

const PAYMENT_ATTEMPT_FULL_SELECT =
  "id, user_id, status, amount, currency, provider_reference, payment_group_id, checkout_session_id, place_promotion_checkout_id, event_promotion_checkout_id, transaction_id";

export async function finalizePaystackPayment(
  supabase: SupabaseClient,
  primaryAttemptId: string,
): Promise<FinalizeResult> {
  const { data: primary, error: primaryError } = await supabase
    .from("payment_attempt")
    .select(PAYMENT_ATTEMPT_FULL_SELECT)
    .eq("id", primaryAttemptId)
    .maybeSingle<PaymentAttemptFullRow>();

  if (primaryError || !primary) {
    logger.error(
      `finalizePaystackPayment: attempt not found (${primaryError?.message})`,
    );
    return { status: "not_found" };
  }

  if (primary.status === "succeeded") {
    return { status: "succeeded" };
  }

  if (!primary.provider_reference) {
    // Paystack was never initialized for this attempt — nothing to verify.
    return { status: "failed", message: "Payment was never started" };
  }

  // Grouped multi-checkout payments (see createMultiCheckoutPaymentAttempt.ts)
  // share one Paystack transaction across several payment_attempt rows, all
  // tagged with the same payment_group_id. Only the primary row carries the
  // Paystack reference; siblings are finalized alongside it.
  let groupMembers: PaymentAttemptFullRow[] = [primary];
  if (primary.payment_group_id) {
    const { data: siblings, error: siblingsError } = await supabase
      .from("payment_attempt")
      .select(PAYMENT_ATTEMPT_FULL_SELECT)
      .eq("payment_group_id", primary.payment_group_id)
      .in("status", [
        "initiated",
        "pending",
        "processing",
        "succeeded",
        "fulfillment_failed",
      ]);

    if (siblingsError) {
      logger.error(
        `finalizePaystackPayment: failed fetching group members (${siblingsError.message})`,
      );
      return { status: "failed", message: "Something went wrong" };
    }

    if (siblings && siblings.length > 0) {
      groupMembers = siblings as PaymentAttemptFullRow[];
    }
  }

  if (groupMembers.every((m) => m.status === "succeeded")) {
    // Every member already finalized (e.g. a previous, fully successful
    // run) — treat the whole group as already handled rather than
    // re-running ticket generation for members that already have tickets.
    return { status: "succeeded" };
  }

  // Atomic CAS lock: only one concurrent caller (frontend verify vs.
  // webhook, or two overlapping webhook deliveries) can move the primary
  // attempt from an open state into 'processing'. Losing this race means
  // another call is already handling (or has already finished handling)
  // this payment — never proceed to verify/issue tickets twice.
  // 'fulfillment_failed' is included so a retry (webhook redelivery, or the
  // user-triggered retryPaymentFulfillment.ts) can re-enter the pipeline —
  // unlike 'failed', which stays permanently terminal (a real decline).
  const { data: locked, error: lockError } = await supabase
    .from("payment_attempt")
    .update({ status: "processing", updated_at: new Date() })
    .eq("id", primary.id)
    .in("status", ["initiated", "pending", "fulfillment_failed"])
    .select("id")
    .maybeSingle();

  if (lockError) {
    logger.error(`finalizePaystackPayment: lock failed (${lockError.message})`);
    return { status: "failed", message: "Something went wrong" };
  }

  if (!locked) {
    return { status: "already_processing" };
  }

  const siblingIds = groupMembers
    .map((m) => m.id)
    .filter((id) => id !== primary.id);

  if (siblingIds.length > 0) {
    await supabase
      .from("payment_attempt")
      .update({ status: "processing", updated_at: new Date() })
      .in("id", siblingIds)
      .in("status", ["initiated", "pending", "fulfillment_failed"]);
  }

  const markGroup = async (
    status: "failed" | "succeeded",
    extra: Record<string, unknown> = {},
  ) => {
    await supabase
      .from("payment_attempt")
      .update({ status, updated_at: new Date(), ...extra })
      .in(
        "id",
        groupMembers.map((m) => m.id),
      );
  };

  let verification: Awaited<ReturnType<typeof verifyTransaction>>;
  try {
    verification = await verifyTransaction(primary.provider_reference);
  } catch (error) {
    logger.error(`finalizePaystackPayment: verify call failed (${error})`);
    // A transient Paystack/network failure shouldn't permanently fail the
    // payment — leave it retryable so a later webhook delivery (or another
    // manual verify) can try again instead of stranding a real payment.
    await markGroup("failed", {
      failure_reason: "Could not reach Paystack to verify this payment",
    });
    return {
      status: "failed",
      message: "Could not verify payment right now. Please try again.",
    };
  }

  const expectedAmountPesewas = toPesewas(
    groupMembers.reduce((sum, m) => sum + m.amount, 0),
  );

  if (verification.reference !== primary.provider_reference) {
    logger.error(
      `finalizePaystackPayment: reference mismatch for attempt ${primary.id}`,
    );
    await markGroup("failed", { failure_reason: "Reference mismatch" });
    return { status: "failed", message: "Payment could not be verified" };
  }

  if (verification.status === "pending" || verification.status === "queued") {
    // Ghana mobile money and some other channels can stay pending while the
    // customer authorizes on their phone — this is not a failure, and
    // inventory/checkout stays reserved via the existing 30-minute expiry
    // window. Revert the lock so a later webhook delivery can retry.
    await supabase
      .from("payment_attempt")
      .update({ status: "pending", updated_at: new Date() })
      .in(
        "id",
        groupMembers.map((m) => m.id),
      );
    return {
      status: "pending",
      message: "Your payment is still awaiting authorization.",
    };
  }

  if (
    verification.status !== "success" ||
    verification.amount !== expectedAmountPesewas ||
    verification.currency.toUpperCase() !== primary.currency.toUpperCase()
  ) {
    logger.error(
      `finalizePaystackPayment: verification mismatch for attempt ${primary.id} (status=${verification.status}, amount=${verification.amount} vs ${expectedAmountPesewas}, currency=${verification.currency} vs ${primary.currency})`,
    );
    await markGroup("failed", {
      failure_reason:
        verification.status !== "success"
          ? `Paystack reported status: ${verification.status}`
          : "Amount/currency mismatch on verification",
    });
    return {
      status: "failed",
      message:
        verification.status === "abandoned"
          ? "This payment was cancelled."
          : "Your payment was declined. Please try another payment method.",
    };
  }

  // One `transaction` row per Paystack charge (not per group member) — a
  // grouped multi-checkout payment shares a single Paystack reference across
  // several payment_attempt rows, and that reference is unique per
  // transaction row, so all tickets issued from this charge point at the
  // same transaction. Every member in a group is always the same kind
  // (all ticket checkouts, or one promotion — createMultiCheckoutPaymentAttempt
  // never mixes them; a promotion purchase is never grouped in practice, but
  // the reason derivation stays correct even if it ever were), so a single
  // `reason` value is correct here.
  const { data: userInfo } = await supabase
    .from("user_info")
    .select("username, full_name")
    .eq("id", primary.user_id)
    .maybeSingle();

  const reason = primary.checkout_session_id
    ? "Ticket_Purchase"
    : "Promotion_Purchase";

  // On a retry (this attempt previously reached "fulfillment_failed"), the
  // transaction row was already recorded — reuse it via the FK this table
  // has always had but never populated, rather than attempting a second
  // insert. `transaction.paystack_reference` also carries its own unique
  // constraint as a backstop, but checking first keeps a normal retry from
  // ever hitting that error path at all.
  let transactionRow: { id: string } | null = primary.transaction_id
    ? { id: primary.transaction_id }
    : null;

  if (!transactionRow) {
    const { data: existingTransaction } = await supabase
      .from("transaction")
      .select("id")
      .eq("paystack_reference", primary.provider_reference)
      .maybeSingle();

    transactionRow = existingTransaction ?? null;
  }

  if (!transactionRow) {
    const { data: insertedTransaction, error: transactionInsertError } =
      await supabase
        .from("transaction")
        .insert({
          user_id: primary.user_id,
          full_name:
            userInfo?.full_name ??
            userInfo?.username ??
            verification.customer.email,
          email: verification.customer.email,
          reason,
          amount: fromPesewas(expectedAmountPesewas),
          currency: primary.currency,
          status: "successful",
          payment_method: "paystack",
          payment_gateway_response: verification,
          paystack_reference: primary.provider_reference,
        })
        .select("id")
        .maybeSingle();

    if (transactionInsertError || !insertedTransaction) {
      logger.error(
        `finalizePaystackPayment: failed recording transaction for attempt ${primary.id} (${transactionInsertError?.message})`,
      );
      await markGroup("failed", {
        failure_reason: "Failed to record transaction",
      });
      return {
        status: "failed",
        message:
          "Payment succeeded but we couldn't record it. Please contact support.",
      };
    }

    transactionRow = insertedTransaction;
  }

  await supabase
    .from("payment_attempt")
    .update({ transaction_id: transactionRow.id, updated_at: new Date() })
    .in(
      "id",
      groupMembers.map((m) => m.id),
    );

  // Verified — issue tickets / activate the promotion per group member,
  // reusing the existing, unmodified ticket-generation and promotion-
  // activation logic. Each member is independent: if one session's ticket
  // issuance fails (e.g. a transient Cloudinary error) after a shared
  // Paystack payment already succeeded, that member is left in a retryable
  // state rather than silently marked succeeded, while the others still
  // complete — a rare edge case documented as a known limitation rather
  // than solved with automated compensation/refunds (out of scope here).
  let anyFailed = false;

  for (const member of groupMembers) {
    // A retry (this member reached "fulfillment_failed" on a prior run and
    // is being re-attempted) must never redo a member that already
    // succeeded within the same group — only the members that actually
    // failed need re-fulfilling.
    if (member.status === "succeeded") continue;

    // Carrying the already-verified email avoids ticketPurchaseNotification
    // falling back to supabase.auth.admin.getUserById() — that admin API
    // call only works with a service-role client (the webhook path), and
    // silently fails on the ordinary cookie-bound client this frontend
    // verify path uses, which was dropping the purchase email entirely.
    const authOverride = {
      supabase,
      userId: primary.user_id,
      userEmail: verification.customer.email,
    };

    if (member.checkout_session_id) {
      const result = await generateTicket(
        member.checkout_session_id,
        transactionRow.id,
        JSON.stringify({
          provider: "paystack",
          reference: primary.provider_reference,
          paymentAttemptId: member.id,
        }),
        authOverride,
      );

      if (result.status === 200) {
        await supabase
          .from("payment_attempt")
          .update({
            status: "succeeded",
            paid_at: new Date(),
            verified_at: new Date(),
            updated_at: new Date(),
          })
          .eq("id", member.id);
      } else {
        logger.error(
          `finalizePaystackPayment: generateTicket failed for attempt ${member.id}: ${result.status} ${result.message}`,
        );
        anyFailed = true;
        await supabase
          .from("payment_attempt")
          .update({
            status: "fulfillment_failed",
            failure_reason: result.message ?? "Ticket generation failed",
            verified_at: new Date(),
            updated_at: new Date(),
          })
          .eq("id", member.id);
      }
    } else if (member.place_promotion_checkout_id) {
      const result = await activatePlacePromotion(
        member.place_promotion_checkout_id,
        authOverride,
      );

      if (result.status === 200) {
        await supabase
          .from("payment_attempt")
          .update({
            status: "succeeded",
            paid_at: new Date(),
            verified_at: new Date(),
            updated_at: new Date(),
          })
          .eq("id", member.id);
      } else {
        logger.error(
          `finalizePaystackPayment: activatePlacePromotion failed for attempt ${member.id}: ${result.status} ${result.message}`,
        );
        anyFailed = true;
        await supabase
          .from("payment_attempt")
          .update({
            status: "fulfillment_failed",
            failure_reason: result.message ?? "Promotion activation failed",
            verified_at: new Date(),
            updated_at: new Date(),
          })
          .eq("id", member.id);
      }
    } else if (member.event_promotion_checkout_id) {
      const result = await activateEventPromotion(
        member.event_promotion_checkout_id,
        authOverride,
      );

      if (result.status === 200) {
        await supabase
          .from("payment_attempt")
          .update({
            status: "succeeded",
            paid_at: new Date(),
            verified_at: new Date(),
            updated_at: new Date(),
          })
          .eq("id", member.id);
      } else {
        logger.error(
          `finalizePaystackPayment: activateEventPromotion failed for attempt ${member.id}: ${result.status} ${result.message}`,
        );
        anyFailed = true;
        await supabase
          .from("payment_attempt")
          .update({
            status: "fulfillment_failed",
            failure_reason: result.message ?? "Promotion activation failed",
            verified_at: new Date(),
            updated_at: new Date(),
          })
          .eq("id", member.id);
      }
    }
  }

  if (anyFailed) {
    return {
      status: "fulfillment_failed",
      message:
        "Your payment was successful, but we couldn't finish issuing everything yet. Tap Retry to finish — you won't be charged again.",
      paymentAttemptId: primary.id,
    };
  }

  // Record Abonten's service-fee revenue for this charge (ticket purchases
  // only — a promotion purchase has no organizer/ticket split). One row per
  // transaction, idempotent, so retries and the webhook+client-verify race
  // are both safe. `verification.fees` is Paystack's own processing cost for
  // the charge when it reports it; passed straight through so
  // platform_fee_entry can record Abonten's true net revenue. Deliberately
  // after every ticket has been issued so record_platform_fee sees the
  // complete ticket_revenue for the transaction.
  if (primary.checkout_session_id) {
    const processingCost =
      verification.fees != null ? fromPesewas(verification.fees) : null;

    const { error: platformFeeError } = await supabase.rpc(
      "record_platform_fee",
      {
        p_transaction_id: transactionRow.id,
        p_processing_cost: processingCost,
      },
    );

    if (platformFeeError) {
      // Non-fatal: the purchase is complete and correct for the buyer and
      // organizer. A missing fee-revenue row is an internal-accounting gap
      // to reconcile, not a reason to fail a successful payment.
      logger.error(
        `finalizePaystackPayment: record_platform_fee failed for transaction ${transactionRow.id} (${platformFeeError.message})`,
      );
    }
  }

  return { status: "succeeded" };
}
