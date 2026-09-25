import type { Database, Json } from "@abonten/types/database.types";
// The single authoritative path that turns a confirmed charge into a
// finished Abonten purchase, for every provider. Both the client-triggered
// verify action (optimistic fast path right after the popup / redirect)
// and the provider webhook (the authoritative source of truth) call this
// exact function — neither duplicates the other's logic, and neither ever
// marks a purchase successful without an independent provider verification
// through the provider adapter of the attempt's market.
//
// Deliberately NOT a "use server" Server Action: it takes a payment_attempt
// id the caller has already authorised (verify/retry check the attempt is
// the caller's own; the webhook's authority is the provider signature) and
// the purchase-fulfilment steps as injected deps (they stay in apps/web —
// Next primitives + React email).
//
// Every read and write here uses the service-role client: payment_attempt,
// transaction and the promotion/ticket tables are not client-writable
// (migration lock_money_path_client_writes), and the fulfilment deps get the
// same client through authOverride.

import { logger } from "@abonten/core/logger";
import {
  type Money,
  fromMajor,
  money,
  sum,
  toMajor,
} from "@abonten/core/money/money";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CreditReservationRow,
  captureReservation,
  getReservationForAttempt,
  releaseReservation,
} from "../rewards/creditRedemptionCore";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import type { PaymentFulfillmentDeps } from "./fulfillmentDeps";
import { refundOrphanCapture } from "./orphanCapture";
import { NoProviderError, resolveProviderAccount } from "./providers/registry";
import type {
  PaymentProvider,
  ProviderAccount,
  VerificationResult,
} from "./providers/types";

/**
 * A failed or cancelled attempt the provider may still have been paid for.
 * Success at the provider = an orphan capture, refunded in full; a refund
 * request that fails comes back as "pending" so a webhook redelivers.
 */
async function reconcileClosedAttempt(
  primary: PaymentAttemptFullRow,
): Promise<FinalizeResult> {
  let resolved: Awaited<ReturnType<typeof resolveProviderAccount>>;
  let verification: VerificationResult;
  try {
    resolved = await resolveProviderAccount({
      countryCode: primary.country_code,
      currency: primary.currency,
      providerCode: primary.provider,
    });
    verification = await resolved.provider.verify(
      resolved.account,
      primary.provider_reference as string,
    );
  } catch (error) {
    logger.error(
      `finalizePayment: could not check closed attempt ${primary.id} (${error instanceof Error ? error.message : String(error)})`,
    );
    return {
      status: "pending",
      message: "Could not verify payment right now. Please try again.",
    };
  }

  if (
    verification.status !== "success" ||
    verification.reference !== primary.provider_reference
  ) {
    return {
      status: "failed",
      message:
        primary.status === "cancelled"
          ? "This payment was replaced by a newer one."
          : "This payment didn't go through.",
    };
  }

  const refunded = await refundOrphanCapture({
    provider: resolved.provider,
    account: resolved.account,
    verification,
    attempt: primary,
    source: "webhook",
    reason: `charge completed after the attempt was ${primary.status}`,
  });
  return refunded.status === "refund_requested"
    ? {
        status: "failed",
        message:
          "This payment arrived after the order had closed, so it is being refunded in full.",
      }
    : {
        status: "pending",
        message: "We're sorting out this payment. Please check back shortly.",
      };
}

/**
 * The fields every money-path log line carries, so a log drain or alert can
 * split failures by market, provider, method and currency. Never a secret,
 * a card detail or a phone number.
 */
function paymentLogData(
  attempt: PaymentAttemptFullRow,
  failure: string,
): { payment: Record<string, unknown> } {
  return {
    payment: {
      attemptId: attempt.id,
      transactionId: attempt.transaction_id,
      provider: attempt.provider,
      country: attempt.country_code,
      currency: attempt.currency,
      method:
        typeof attempt.metadata?.method === "string"
          ? attempt.metadata.method
          : null,
      reference: attempt.provider_reference,
      failure,
    },
  };
}

// Payments paid entirely with Abonten Credit (createPromotionPaymentAttemptCore)
// run through this same function so retries, fulfilment and the recovery
// cron behave identically; they skip only the provider verification call.
export const CREDIT_PROVIDER = "abonten_credit";

type PaymentAttemptFullRow = {
  id: string;
  user_id: string;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  country_code: string | null;
  provider_reference: string | null;
  payment_group_id: string | null;
  checkout_session_id: string | null;
  place_promotion_checkout_id: string | null;
  event_promotion_checkout_id: string | null;
  content_campaign_checkout_id: string | null;
  transaction_id: string | null;
  metadata: Record<string, unknown> | null;
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
  "id, user_id, status, amount, currency, provider, country_code, provider_reference, payment_group_id, checkout_session_id, place_promotion_checkout_id, event_promotion_checkout_id, content_campaign_checkout_id, transaction_id, metadata, updated_at";

function reservationTarget(
  attempt: PaymentAttemptFullRow,
): { type: string; id: string } | null {
  // Ticket credit is reserved for the whole payment group (one charge can
  // cover several checkout sessions).
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
  if (attempt.content_campaign_checkout_id) {
    return {
      type: "content_campaign_checkout",
      id: attempt.content_campaign_checkout_id,
    };
  }
  return null;
}

/**
 * Whether the credit reservation really belongs to this attempt: same user,
 * same checkout. The reservation is written only by the credit_* functions,
 * so it -- not the payment_attempt row -- decides how much credit paid and
 * how much cash the provider must have collected.
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
      : reservation.target_type === "content_campaign_checkout"
        ? "content_campaign_checkout"
        : "place_promotion_checkout";
  const { data } = await getSupabaseServiceClient()
    .from(table)
    .select("status, expires_at")
    .eq("id", reservation.target_id)
    .maybeSingle();
  if (!data) return true;
  if (data.status === "paid") return false;
  return (
    data.status !== "pending" ||
    (!!data.expires_at &&
      new Date(data.expires_at).getTime() < Date.now() - 60 * 1000)
  );
}

function attemptMoney(m: PaymentAttemptFullRow): Money {
  return fromMajor(Number(m.amount), m.currency);
}

export async function finalizePayment(
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
      `finalizePayment: attempt not found (${primaryError?.message})`,
    );
    return { status: "not_found" };
  }

  if (primary.status === "succeeded") {
    return { status: "succeeded" };
  }

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
    return { status: "failed", message: "Payment was never started" };
  }

  // A closed attempt (declined, expired, replaced by another method) can
  // still be paid at the provider afterwards — a late mobile-money
  // approval, a stale tab. Before, that money was simply kept: the lock
  // below refused the attempt and the webhook retried for days. Now the
  // provider is asked what happened, and a real capture is refunded.
  if (
    (primary.status === "failed" || primary.status === "cancelled") &&
    primary.provider !== CREDIT_PROVIDER
  ) {
    return reconcileClosedAttempt(primary);
  }

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
        `finalizePayment: failed fetching group members (${siblingsError.message})`,
      );
      return { status: "failed", message: "Something went wrong" };
    }

    if (siblings && siblings.length > 0) {
      groupMembers = siblings as PaymentAttemptFullRow[];
    }
  }

  if (groupMembers.every((m) => m.status === "succeeded")) {
    return { status: "succeeded" };
  }

  // Atomic CAS lock: only one concurrent caller (frontend verify vs.
  // webhook, or two overlapping webhook deliveries) can move the primary
  // attempt from an open state into 'processing'.
  const { data: locked, error: lockError } = await supabase
    .from("payment_attempt")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", primary.id)
    .in("status", ["initiated", "pending", "fulfillment_failed"])
    .select("id")
    .maybeSingle();

  if (lockError) {
    logger.error(`finalizePayment: lock failed (${lockError.message})`);
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

  const memberIds = groupMembers.map((m) => m.id);
  const markGroup = async (
    status: "failed" | "succeeded",
    extra: Record<string, unknown> = {},
  ) => {
    await supabase
      .from("payment_attempt")
      .update({ status, updated_at: new Date().toISOString(), ...extra })
      .in("id", memberIds);
  };
  const revertToPending = async () => {
    await supabase
      .from("payment_attempt")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .in("id", memberIds);
  };

  let reservation: CreditReservationRow | null = null;
  try {
    reservation = await getReservationForAttempt(primary.id);
  } catch {
    await revertToPending();
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
      `finalizePayment: credit reservation ${reservation.id} does not match attempt ${primary.id}`,
    );
    reservation = null;
  }

  // The provider account is the one that started this charge: same
  // provider, same market, same currency.
  let account: ProviderAccount;
  let providerImpl: PaymentProvider;
  let verification: VerificationResult;
  try {
    const resolved = await resolveProviderAccount({
      countryCode: primary.country_code,
      currency: primary.currency,
      providerCode: primary.provider,
    });
    account = resolved.account;
    providerImpl = resolved.provider;
    verification = await resolved.provider.verify(
      account,
      primary.provider_reference,
    );
  } catch (error) {
    if (error instanceof NoProviderError) {
      // Configuration, not a decline: the charge may well have succeeded at
      // the provider. Keep the attempt retryable and shout.
      logger.error(
        `finalizePayment: ${error.message} (attempt ${primary.id})`,
        paymentLogData(primary, "provider_not_configured"),
      );
    } else {
      logger.error(
        `finalizePayment: verify call failed (${error})`,
        paymentLogData(primary, "verify_unreachable"),
      );
    }
    // FIN-003: a transient provider/network failure is not a decline — it
    // must not permanently fail a charge that may well have succeeded.
    await revertToPending();
    return {
      status: "pending",
      message: "Could not verify payment right now. Please try again.",
    };
  }

  // With credit applied, the provider must have collected exactly the cash
  // part the server worked out when it reserved the credit.
  const expectedCash: Money = reservation
    ? money(reservation.cash_minor, primary.currency)
    : sum(groupMembers.map(attemptMoney), primary.currency);

  if (verification.reference !== primary.provider_reference) {
    logger.error(
      `finalizePayment: reference mismatch for attempt ${primary.id}`,
      paymentLogData(primary, "reference_mismatch"),
    );
    await markGroup("failed", { failure_reason: "Reference mismatch" });
    return { status: "failed", message: "Payment could not be verified" };
  }

  if (verification.status === "pending") {
    // Mobile money and some other channels stay pending while the customer
    // authorises on their phone — not a failure; inventory stays reserved
    // via the checkout expiry window. Revert the lock for a later retry.
    await revertToPending();
    return {
      status: "pending",
      message: "Your payment is still awaiting authorization.",
    };
  }

  const amountMatches =
    verification.amount.amountMinor === expectedCash.amountMinor &&
    verification.amount.currency === expectedCash.currency;

  if (verification.status !== "success" || !amountMatches) {
    logger.error(
      `finalizePayment: verification mismatch for attempt ${primary.id} (status=${verification.status}, amount=${verification.amount.amountMinor} ${verification.amount.currency} vs ${expectedCash.amountMinor} ${expectedCash.currency})`,
    );
    await markGroup("failed", {
      failure_reason:
        verification.status !== "success"
          ? `${account.provider} reported status: ${verification.status}${verification.detail ? ` (${verification.detail})` : ""}`
          : "Amount/currency mismatch on verification",
    });
    if (reservation) {
      await releaseReservation(reservation.id, "payment_failed");
    }
    // The provider took money, but not the amount this order costs (or in
    // another currency): nothing is issued for it, and it goes back.
    if (verification.status === "success" && !amountMatches) {
      const refunded = await refundOrphanCapture({
        provider: providerImpl,
        account,
        verification,
        attempt: primary,
        source: "verify",
        reason: `amount mismatch: expected ${expectedCash.amountMinor} ${expectedCash.currency}`,
      });
      return refunded.status === "refund_requested"
        ? {
            status: "failed",
            message:
              "The amount charged didn't match your order, so it is being refunded in full.",
          }
        : {
            status: "pending",
            message:
              "We're sorting out this payment. Please check back shortly.",
          };
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
    cash: expectedCash,
    payerEmail: verification.customerEmail ?? "",
    gatewayResponse: verification.raw as Json,
    providerTransactionId: verification.providerTransactionId,
    providerFee: verification.providerFee,
    settlementCurrency: account.settlementCurrency,
  });
}

type MarkGroup = (
  status: "failed" | "succeeded",
  extra?: Record<string, unknown>,
) => Promise<void>;

/**
 * A payment paid entirely with credit: no provider call, but the same
 * locking, transaction record, fulfilment and retry semantics.
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
    groupMembers.some((m) => attemptMoney(m).amountMinor !== 0) ||
    (!primary.checkout_session_id && !!primary.payment_group_id)
  ) {
    logger.error(
      `finalizePayment: credit-only attempt ${primary.id} has no matching full-credit reservation`,
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
    cash: money(0, primary.currency),
    payerEmail: authUser?.user?.email ?? "",
    gatewayResponse: {
      provider: CREDIT_PROVIDER,
      reservation_id: reservation.id,
      credit_minor: reservation.amount_minor,
    },
    providerTransactionId: null,
    providerFee: null,
    settlementCurrency: primary.currency,
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
  cash,
  payerEmail,
  gatewayResponse,
  providerTransactionId,
  providerFee,
  settlementCurrency,
}: {
  supabase: SupabaseClient<Database>;
  primary: PaymentAttemptFullRow;
  groupMembers: PaymentAttemptFullRow[];
  deps: PaymentFulfillmentDeps;
  markGroup: MarkGroup;
  reservation: CreditReservationRow | null;
  cash: Money;
  payerEmail: string;
  gatewayResponse: Json;
  providerTransactionId: string | null;
  providerFee: Money | null;
  settlementCurrency: string;
}): Promise<FinalizeResult> {
  const {
    issueTickets,
    activatePlacePromotion,
    activateEventPromotion,
    activateContentCampaign,
  } = deps;
  const creditOnly = primary.provider === CREDIT_PROVIDER;
  const memberIds = groupMembers.map((m) => m.id);

  let captureCredit = false;
  if (reservation) {
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
    captureCredit && reservation
      ? toMajor(money(reservation.amount_minor, primary.currency))
      : 0;

  const { data: userInfo } = await supabase
    .from("user_info")
    .select("username, full_name")
    .eq("id", primary.user_id)
    .maybeSingle();

  const reason = primary.checkout_session_id
    ? "Ticket_Purchase"
    : "Promotion_Purchase";

  // Tax added at checkout (exclusive-tax markets) travels on the attempt
  // metadata; the transaction records it so receipts and reconciliation
  // can show it.
  const taxMinor = groupMembers.reduce((acc, m) => {
    const v = m.metadata?.tax_minor;
    return acc + (typeof v === "number" && Number.isFinite(v) ? v : 0);
  }, 0);

  let transactionRow: { id: string } | null = primary.transaction_id
    ? { id: primary.transaction_id }
    : null;

  if (!transactionRow) {
    const { data: existingTransaction } = await supabase
      .from("transaction")
      .select("id")
      .eq("provider", primary.provider)
      .eq("provider_reference", primary.provider_reference as string)
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
          amount: toMajor(cash),
          credit_amount: creditAmount,
          currency: cash.currency,
          status: "successful",
          payment_method: creditOnly
            ? CREDIT_PROVIDER
            : creditAmount > 0
              ? `${primary.provider}+credit`
              : primary.provider,
          payment_gateway_response: gatewayResponse,
          provider: primary.provider,
          provider_reference: primary.provider_reference as string,
          provider_transaction_id: providerTransactionId,
          settlement_currency: settlementCurrency,
          settlement_amount:
            settlementCurrency.toUpperCase() === cash.currency
              ? toMajor(cash)
              : null,
          provider_fee:
            providerFee && providerFee.currency === cash.currency
              ? toMajor(providerFee)
              : null,
          tax_amount: toMajor(money(taxMinor, cash.currency)),
          country_code: primary.country_code,
        })
        .select("id")
        .maybeSingle();

    if (transactionInsertError || !insertedTransaction) {
      logger.error(
        `finalizePayment: failed recording transaction for attempt ${primary.id} (${transactionInsertError?.message})`,
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
    .in("id", memberIds);

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
        .in("id", memberIds);
      return {
        status: "fulfillment_failed",
        message: creditOnly
          ? "We couldn't apply your credit to this order. Tap Retry, or contact support if it keeps failing."
          : "Your payment was successful, but we couldn't apply your credit yet. Tap Retry to finish — you won't be charged again.",
        paymentAttemptId: primary.id,
      };
    }
  }

  let anyFailed = false;
  const succeeded = (id: string) =>
    supabase
      .from("payment_attempt")
      .update({
        status: "succeeded",
        paid_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  const fulfilmentFailed = (id: string, reasonText: string) =>
    supabase
      .from("payment_attempt")
      .update({
        status: "fulfillment_failed",
        failure_reason: reasonText,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

  for (const member of groupMembers) {
    if (member.status === "succeeded") continue;

    const authOverride = {
      supabase,
      userId: primary.user_id,
      userEmail: payerEmail,
    };

    let result: { status: number; message?: string } | null = null;
    let label = "";
    if (member.checkout_session_id) {
      label = "issueTickets";
      result = await issueTickets(
        member.checkout_session_id,
        transactionRow.id,
        JSON.stringify({
          provider: primary.provider,
          reference: primary.provider_reference,
          paymentAttemptId: member.id,
        }),
        authOverride,
      );
    } else if (member.place_promotion_checkout_id) {
      label = "activatePlacePromotion";
      result = await activatePlacePromotion(
        member.place_promotion_checkout_id,
        authOverride,
      );
    } else if (member.event_promotion_checkout_id) {
      label = "activateEventPromotion";
      result = await activateEventPromotion(
        member.event_promotion_checkout_id,
        authOverride,
      );
    } else if (member.content_campaign_checkout_id) {
      label = "activateContentCampaign";
      result = activateContentCampaign
        ? await activateContentCampaign(
            member.content_campaign_checkout_id,
            authOverride,
          )
        : { status: 500, message: "Campaign activation is not wired" };
    }

    if (!result) continue;
    if (result.status === 200) {
      await succeeded(member.id);
    } else {
      logger.error(
        `finalizePayment: ${label} failed for attempt ${member.id}: ${result.status} ${result.message}`,
      );
      anyFailed = true;
      await fulfilmentFailed(member.id, result.message ?? `${label} failed`);
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
  // only). One row per transaction, idempotent. The provider's own fee, when
  // reported in the charge currency, becomes the processing cost.
  if (primary.checkout_session_id) {
    const processingCost =
      providerFee && providerFee.currency === cash.currency
        ? toMajor(providerFee)
        : null;

    const { error: platformFeeError } = await supabase.rpc(
      "record_platform_fee",
      {
        p_transaction_id: transactionRow.id,
        p_processing_cost: processingCost ?? undefined,
      },
    );

    if (platformFeeError) {
      logger.error(
        `finalizePayment: record_platform_fee failed for transaction ${transactionRow.id} (${platformFeeError.message})`,
      );
    }
  }

  return { status: "succeeded" };
}
