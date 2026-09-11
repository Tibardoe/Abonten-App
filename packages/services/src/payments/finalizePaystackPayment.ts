import type { Database, Json } from "@abonten/types/database.types";
// The single authoritative path that turns a Paystack payment into a
// finished Abonten purchase. Both the client-triggered verify action
// (src/actions/verifyPaystackPayment.ts, optimistic fast path right after
// the Paystack popup closes) and the webhook
// (src/app/api/paystack/webhook/route.ts, the authoritative source of
// truth) call this exact function — neither path duplicates the other's
// logic, and neither ever marks a purchase successful without an
// independent Paystack verification.
//
// Deliberately NOT a "use server" Server Action: it takes a payment_attempt
// id the caller has already authorized (verify/retry check the attempt is
// the caller's own; the webhook's authority is Paystack's signature) and the
// three purchase-fulfilment steps as injected deps (they stay in apps/web —
// Next primitives + React email). Same category as
// ticketInventory.ts/paymentAttempt.ts.
//
// Every read and write here uses the service-role client: payment_attempt,
// transaction and the promotion/ticket tables are not client-writable
// (migration lock_money_path_client_writes), and the fulfilment deps get the
// same client through authOverride.

import { logger } from "@abonten/core/logger";
import { fromPesewas, toPesewas } from "@abonten/core/paystackAmount";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CreditReservationRow,
  captureReservation,
  getReservationForAttempt,
  releaseReservation,
} from "../rewards/creditRedemptionCore";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import type { PaymentFulfillmentDeps } from "./fulfillmentDeps";
import { verifyTransaction } from "./gateway/paystackService";

// Payments paid entirely with Abonten Credit (createPromotionPaymentAttemptCore)
// run through this same function so retries, fulfilment and the recovery
// cron behave identically; they skip only the Paystack verification call.
const CREDIT_PROVIDER = "abonten_credit";

type PaymentAttemptFullRow = {
  id: string;
  user_id: string;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  provider_reference: string | null;
  payment_group_id: string | null;
  checkout_session_id: string | null;
  place_promotion_checkout_id: string | null;
  event_promotion_checkout_id: string | null;
  transaction_id: string | null;
  updated_at: string;
};

// REL-001: a crash/timeout between the CAS lock below (initiated/pending/
// fulfillment_failed -> processing) and this function returning leaves the
// row stuck in 'processing' forever — 'processing' was never in the CAS
// re-entry list, so neither a webhook redelivery nor a user-triggered retry
// could ever pick it back up. The pg_cron job `recover-stale-payment-
// attempts` (every 5 min) is the systemic fix; this is a same-request
// self-heal so a caller doesn't have to wait for the next cron tick.
const STUCK_PROCESSING_MINUTES = 15;

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
  "id, user_id, status, amount, currency, provider, provider_reference, payment_group_id, checkout_session_id, place_promotion_checkout_id, event_promotion_checkout_id, transaction_id, updated_at";

type Verification = Awaited<ReturnType<typeof verifyTransaction>>;

function reservationTarget(
  attempt: PaymentAttemptFullRow,
): { type: string; id: string } | null {
  // Ticket credit is reserved for the whole payment group (one Paystack
  // charge can cover several checkout sessions).
  if (attempt.checkout_session_id && attempt.payment_group_id) {
    return { type: "ticket_payment_group", id: attempt.payment_group_id };
  }
  if (attempt.event_promotion_checkout_id) {
    return {
      type: "event_promotion_checkout",
      id: attempt.event_promotion_checkout_id,
    };
  }
  if (attempt.place_promotion_checkout_id) {
    return {
      type: "place_promotion_checkout",
      id: attempt.place_promotion_checkout_id,
    };
  }
  return null;
}

/**
 * Whether the credit reservation really belongs to this attempt: same user,
 * same checkout. The reservation is written only by the credit_* functions,
 * so it -- not the payment_attempt row -- decides how much credit paid and
 * how much cash Paystack must have collected.
 */
function reservationMatches(
  attempt: PaymentAttemptFullRow,
  reservation: CreditReservationRow,
): boolean {
  const target = reservationTarget(attempt);
  return (
    !!target &&
    reservation.user_id === attempt.user_id &&
    reservation.target_type === target.type &&
    reservation.target_id === target.id
  );
}

/** Has the checkout this credit was reserved for lapsed? */
async function reservedCheckoutLapsed(
  reservation: CreditReservationRow,
  groupMembers: PaymentAttemptFullRow[],
): Promise<boolean> {
  if (reservation.target_type === "ticket_payment_group") {
    // A ticket session that was expired or cancelled can't be issued
    // (issue_tickets_for_checkout refuses it). One still 'pending' past its
    // expiry is fine: the sweep never expires a session whose payment is
    // in flight.
    const sessions = groupMembers
      .map((m) => m.checkout_session_id)
      .filter((id): id is string => !!id);
    const { data } = await getSupabaseServiceClient()
      .from("ticket_checkout")
      .select("status")
      .in("checkout_session_id", sessions.length > 0 ? sessions : [""]);
    return (
      !data ||
      data.length === 0 ||
      data.some((r) => r.status !== "pending" && r.status !== "paid")
    );
  }
  const table =
    reservation.target_type === "event_promotion_checkout"
      ? "event_promotion_checkout"
      : "place_promotion_checkout";
  const { data } = await getSupabaseServiceClient()
    .from(table)
    .select("status, expires_at")
    .eq("id", reservation.target_id)
    .maybeSingle();
  if (!data) return true;
  if (data.status === "paid") return false;
  // Same rule as expire_stale_*_promotion_checkouts, which the activation
  // step runs first: pending but more than a minute past its expiry is
  // about to be expired, so the activation would refuse it.
  return (
    data.status !== "pending" ||
    (!!data.expires_at &&
      new Date(data.expires_at).getTime() < Date.now() - 60 * 1000)
  );
}

export async function finalizePaystackPayment(
  primaryAttemptId: string,
  deps: PaymentFulfillmentDeps,
): Promise<FinalizeResult> {
  const supabase = getSupabaseServiceClient();
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

  // Self-heal a stuck lock (see STUCK_PROCESSING_MINUTES above) before the
  // CAS below, so this same call can recover it instead of returning
  // 'already_processing' for an attempt nothing is actually working on.
  if (
    primary.status === "processing" &&
    Date.now() - new Date(primary.updated_at).getTime() >
      STUCK_PROCESSING_MINUTES * 60 * 1000
  ) {
    const recoveredStatus = primary.transaction_id
      ? "fulfillment_failed"
      : "pending";
    await supabase
      .from("payment_attempt")
      .update({ status: recoveredStatus, updated_at: new Date().toISOString() })
      .eq("id", primary.id)
      .eq("status", "processing");
    primary.status = recoveredStatus;
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
    .update({ status: "processing", updated_at: new Date().toISOString() })
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
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .in("id", siblingIds)
      .in("status", ["initiated", "pending", "fulfillment_failed"]);
  }

  const markGroup = async (
    status: "failed" | "succeeded",
    extra: Record<string, unknown> = {},
  ) => {
    await supabase
      .from("payment_attempt")
      .update({ status, updated_at: new Date().toISOString(), ...extra })
      .in(
        "id",
        groupMembers.map((m) => m.id),
      );
  };

  // Credit applied to this payment, if any -- reserved against the primary
  // attempt (for a ticket group, on behalf of the whole group).
  let reservation: CreditReservationRow | null = null;
  try {
    reservation = await getReservationForAttempt(primary.id);
  } catch {
    await supabase
      .from("payment_attempt")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .in(
        "id",
        groupMembers.map((m) => m.id),
      );
    return {
      status: "pending",
      message: "Could not verify payment right now. Please try again.",
    };
  }

  if (primary.provider === CREDIT_PROVIDER) {
    return finalizeCreditOnly(
      supabase,
      primary,
      groupMembers,
      reservation,
      deps,
      markGroup,
    );
  }

  if (reservation && !reservationMatches(primary, reservation)) {
    logger.error(
      `finalizePaystackPayment: credit reservation ${reservation.id} does not match attempt ${primary.id}`,
    );
    reservation = null;
  }

  let verification: Verification;
  try {
    verification = await verifyTransaction(primary.provider_reference);
  } catch (error) {
    logger.error(`finalizePaystackPayment: verify call failed (${error})`);
    // FIN-003: a transient Paystack/network failure (or a response Paystack
    // sent that doesn't match the expected shape) is not a decline — it
    // must not permanently fail a charge that may well have succeeded.
    // Revert to 'pending' (not 'failed'): 'pending' stays in every re-entry
    // set (this function's CAS lock above, and retryPaymentFulfillmentCore),
    // so a later webhook delivery or manual retry can actually recover the
    // payment. 'failed' is reserved for a genuine terminal decline from
    // Paystack itself, handled below.
    await supabase
      .from("payment_attempt")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .in(
        "id",
        groupMembers.map((m) => m.id),
      );
    return {
      status: "pending",
      message: "Could not verify payment right now. Please try again.",
    };
  }

  // With credit applied, Paystack must have collected exactly the cash part
  // the server worked out when it reserved the credit.
  const expectedAmountPesewas = reservation
    ? reservation.cash_minor
    : toPesewas(groupMembers.reduce((sum, m) => sum + m.amount, 0));

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
      .update({ status: "pending", updated_at: new Date().toISOString() })
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
    if (reservation) {
      await releaseReservation(reservation.id, "payment_failed");
    }
    return {
      status: "failed",
      message:
        verification.status === "abandoned"
          ? "This payment was cancelled."
          : "Your payment was declined. Please try another payment method.",
    };
  }

  return completeVerifiedPayment({
    supabase,
    primary,
    groupMembers,
    deps,
    markGroup,
    reservation,
    cashPesewas: expectedAmountPesewas,
    payerEmail: verification.customer.email,
    gatewayResponse: verification as unknown as Json,
    processingCostPesewas: verification.fees ?? null,
  });
}

type MarkGroup = (
  status: "failed" | "succeeded",
  extra?: Record<string, unknown>,
) => Promise<void>;

/**
 * A payment paid entirely with credit: no Paystack call, but the same
 * locking, transaction record, fulfilment and retry semantics. The credit
 * reservation must exist, belong to this attempt's user and checkout, and
 * cover the whole order -- otherwise the attempt is refused.
 */
async function finalizeCreditOnly(
  supabase: SupabaseClient<Database>,
  primary: PaymentAttemptFullRow,
  groupMembers: PaymentAttemptFullRow[],
  reservation: CreditReservationRow | null,
  deps: PaymentFulfillmentDeps,
  markGroup: MarkGroup,
): Promise<FinalizeResult> {
  if (
    !reservation ||
    !reservationMatches(primary, reservation) ||
    reservation.cash_minor !== 0 ||
    groupMembers.some((m) => toPesewas(m.amount) !== 0) ||
    // Promotions are never grouped; a ticket group's credit is reserved
    // for the group itself.
    (!primary.checkout_session_id && !!primary.payment_group_id)
  ) {
    logger.error(
      `finalizePaystackPayment: credit-only attempt ${primary.id} has no matching full-credit reservation`,
    );
    await markGroup("failed", {
      failure_reason: "Credit payment could not be verified",
    });
    return { status: "failed", message: "Payment could not be verified" };
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(
    primary.user_id,
  );

  return completeVerifiedPayment({
    supabase,
    primary,
    groupMembers,
    deps,
    markGroup,
    reservation,
    cashPesewas: 0,
    payerEmail: authUser?.user?.email ?? "",
    gatewayResponse: {
      provider: CREDIT_PROVIDER,
      reservation_id: reservation.id,
      credit_minor: reservation.amount_minor,
    },
    processingCostPesewas: null,
  });
}

/**
 * Everything after the money is confirmed: the `transaction` row, capturing
 * any credit, fulfilment per group member, and the platform-fee record.
 */
async function completeVerifiedPayment({
  supabase,
  primary,
  groupMembers,
  deps,
  markGroup,
  reservation,
  cashPesewas,
  payerEmail,
  gatewayResponse,
  processingCostPesewas,
}: {
  supabase: SupabaseClient<Database>;
  primary: PaymentAttemptFullRow;
  groupMembers: PaymentAttemptFullRow[];
  deps: PaymentFulfillmentDeps;
  markGroup: MarkGroup;
  reservation: CreditReservationRow | null;
  cashPesewas: number;
  payerEmail: string;
  gatewayResponse: Json;
  processingCostPesewas: number | null;
}): Promise<FinalizeResult> {
  const { issueTickets, activatePlacePromotion, activateEventPromotion } = deps;
  const creditOnly = primary.provider === CREDIT_PROVIDER;

  // Credit reserved for a checkout that has since lapsed is given back
  // rather than spent: the activation below would refuse the checkout
  // anyway. A credit-only order then simply fails (nothing was charged); a
  // part-credit order continues to "fulfillment_failed" exactly like a
  // cash payment that lands after its checkout expired, and support refunds
  // the cash.
  let captureCredit = false;
  if (reservation) {
    // Already captured on an earlier run: the credit is spent, so carry on
    // (a failed activation lands in "fulfillment_failed" for support).
    if (
      reservation.status !== "captured" &&
      (await reservedCheckoutLapsed(reservation, groupMembers))
    ) {
      await releaseReservation(reservation.id, "checkout_lapsed");
      if (creditOnly) {
        await markGroup("failed", {
          failure_reason: "Checkout expired before it was paid",
        });
        return {
          status: "failed",
          message: "This checkout expired. Please start again.",
        };
      }
    } else {
      captureCredit = true;
    }
  }
  const creditAmount =
    captureCredit && reservation ? fromPesewas(reservation.amount_minor) : 0;

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
      .eq("paystack_reference", primary.provider_reference as string)
      .maybeSingle();

    transactionRow = existingTransaction ?? null;
  }

  if (!transactionRow) {
    const { data: insertedTransaction, error: transactionInsertError } =
      await supabase
        .from("transaction")
        .insert({
          user_id: primary.user_id,
          full_name: userInfo?.full_name ?? userInfo?.username ?? payerEmail,
          email: payerEmail,
          reason,
          // `amount` is always the cash collected; credit is its own column.
          amount: fromPesewas(cashPesewas),
          credit_amount: creditAmount,
          currency: primary.currency,
          status: "successful",
          payment_method: creditOnly
            ? CREDIT_PROVIDER
            : creditAmount > 0
              ? "paystack+credit"
              : "paystack",
          payment_gateway_response: gatewayResponse,
          paystack_reference: primary.provider_reference as string,
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
      if (reservation) {
        await releaseReservation(reservation.id, "transaction_not_recorded");
      }
      return {
        status: "failed",
        message:
          "Payment succeeded but we couldn't record it. Please contact support.",
      };
    }

    transactionRow = insertedTransaction;
  } else if (reservation) {
    // A retry reuses the recorded transaction; keep its credit figure in
    // step with what is actually being captured this time.
    await supabase
      .from("transaction")
      .update({ credit_amount: creditAmount })
      .eq("id", transactionRow.id);
  }

  await supabase
    .from("payment_attempt")
    .update({
      transaction_id: transactionRow.id,
      updated_at: new Date().toISOString(),
    })
    .in(
      "id",
      groupMembers.map((m) => m.id),
    );

  // Spend the reserved credit before fulfilling, so nothing is ever
  // activated without its credit. Idempotent on retries.
  if (captureCredit && reservation) {
    const captured = await captureReservation(
      reservation.id,
      transactionRow.id,
    );
    if (!captured.ok) {
      await supabase
        .from("payment_attempt")
        .update({
          status: "fulfillment_failed",
          failure_reason: captured.message,
          updated_at: new Date().toISOString(),
        })
        .in(
          "id",
          groupMembers.map((m) => m.id),
        );
      return {
        status: "fulfillment_failed",
        message: creditOnly
          ? "We couldn't apply your credit to this order. Tap Retry, or contact support if it keeps failing."
          : "Your payment was successful, but we couldn't apply your credit yet. Tap Retry to finish — you won't be charged again.",
        paymentAttemptId: primary.id,
      };
    }
  }

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

    // Carrying the already-verified email saves ticketPurchaseNotification
    // a supabase.auth.admin.getUserById() lookup.
    const authOverride = {
      supabase,
      userId: primary.user_id,
      userEmail: payerEmail,
    };

    if (member.checkout_session_id) {
      const result = await issueTickets(
        member.checkout_session_id,
        transactionRow.id,
        JSON.stringify({
          provider: primary.provider,
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
            paid_at: new Date().toISOString(),
            verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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
            verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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
            paid_at: new Date().toISOString(),
            verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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
            verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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
            paid_at: new Date().toISOString(),
            verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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
            verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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
      processingCostPesewas != null ? fromPesewas(processingCostPesewas) : null;

    // record_platform_fee writes the RLS-less platform_fee_entry table and
    // is EXECUTE-revoked from `authenticated` (migration 20260903200000).
    // Safe — the payment is already verified against Paystack above.
    const { error: platformFeeError } = await supabase.rpc(
      "record_platform_fee",
      {
        p_transaction_id: transactionRow.id,
        p_processing_cost: processingCost ?? undefined,
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
