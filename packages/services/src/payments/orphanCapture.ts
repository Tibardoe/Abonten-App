// Money the provider captured for a payment Abonten had already closed.
//
// How it happens: a mobile-money approval that lands after the checkout
// expired, a stale browser tab that pays an attempt the buyer had switched
// away from, a charge whose amount did not match the order. There is no
// order to fulfil (the tickets may be gone), so the only correct outcome is
// to give the money back — automatically, once, and visibly.
//
// Each capture is one payment_orphan_capture row keyed by (provider,
// provider reference), so a webhook redelivery or a second verify never
// asks for a second refund. The refund is requested in full through the
// same provider account that took the money; its refund.processed webhook
// marks the row refunded (webhookCore). A refund request that fails leaves
// the row `refund_failed` and the caller answers "retry", so the provider
// redelivers and the refund is tried again; Finance sees every open row.

import { logger } from "@abonten/core/logger";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { toMajor } from "@abonten/core/money/money";
import { createNotificationCore } from "../notifications/createNotification";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import type {
  PaymentProvider,
  ProviderAccount,
  VerificationResult,
} from "./providers/types";

export type OrphanCaptureOutcome =
  /** The refund was requested (now or earlier): nothing more to do. */
  | { status: "refund_requested" }
  /** The refund request failed; ask the provider to redeliver. */
  | { status: "refund_failed"; message: string };

export async function refundOrphanCapture(input: {
  provider: PaymentProvider;
  account: ProviderAccount;
  verification: VerificationResult;
  attempt: {
    id: string;
    user_id: string;
    status: string;
    country_code: string | null;
  };
  source: "webhook" | "verify" | "reconcile";
  reason: string;
}): Promise<OrphanCaptureOutcome> {
  const { provider, account, verification, attempt } = input;
  const supabase = getSupabaseServiceClient();

  const { data: existing, error: readError } = await supabase
    .from("payment_orphan_capture")
    .select("id, status, attempts")
    .eq("provider", account.provider)
    .eq("provider_reference", verification.reference)
    .maybeSingle();
  if (readError) {
    logger.error(`orphanCapture: lookup failed (${readError.message})`);
    return { status: "refund_failed", message: readError.message };
  }
  if (
    existing &&
    ["refund_requested", "refunded", "resolved"].includes(existing.status)
  ) {
    return { status: "refund_requested" };
  }

  let rowId = existing?.id ?? null;
  if (!rowId) {
    const { data: inserted, error: insertError } = await supabase
      .from("payment_orphan_capture")
      .insert({
        provider: account.provider,
        country_code: account.countryCode,
        provider_reference: verification.reference,
        provider_transaction_id: verification.providerTransactionId,
        payment_attempt_id: attempt.id,
        user_id: attempt.user_id,
        amount: toMajor(verification.amount),
        currency: verification.amount.currency,
        attempt_status: attempt.status,
        source: input.source,
        note: input.reason,
      })
      .select("id")
      .maybeSingle();
    if (insertError) {
      // A concurrent caller inserted it first: it owns the refund.
      if (insertError.code === "23505") return { status: "refund_requested" };
      logger.error(`orphanCapture: insert failed (${insertError.message})`);
      return { status: "refund_failed", message: insertError.message };
    }
    rowId = inserted?.id ?? null;
  }

  logger.error(
    `orphanCapture: ${account.provider}/${account.countryCode} captured ${verification.amount.amountMinor} ${verification.amount.currency} for closed attempt ${attempt.id} (${input.reason}); refunding`,
    {
      payment: {
        attemptId: attempt.id,
        provider: account.provider,
        country: account.countryCode,
        currency: verification.amount.currency,
        amountMinor: verification.amount.amountMinor,
        reference: verification.reference,
        failure: "orphan_capture",
      },
    },
  );

  try {
    await provider.refund(account, {
      reference: verification.reference,
      providerTransactionId: verification.providerTransactionId,
      amount: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("payment_orphan_capture")
      .update({
        status: "refund_failed",
        last_error: message,
        attempts: (existing?.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rowId as string);
    logger.error(`orphanCapture: refund request failed (${message})`);
    return { status: "refund_failed", message };
  }

  await supabase
    .from("payment_orphan_capture")
    .update({
      status: "refund_requested",
      refund_requested_at: new Date().toISOString(),
      last_error: null,
      attempts: (existing?.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId as string);

  await createNotificationCore(supabase, {
    userId: attempt.user_id,
    type: "refund_requested",
    title: "We're refunding a payment",
    body: `Your payment of ${formatMoney(verification.amount)} arrived after the order had closed, so nothing was issued for it. We've asked for the full amount to go back to your payment method.`,
    link: "/transactions",
    data: { kind: "ticket" },
  }).catch((error) => {
    logger.error(`orphanCapture: notification failed (${String(error)})`);
  });

  return { status: "refund_requested" };
}

/** A refund confirmation for an orphan capture (no transaction row exists). */
export async function markOrphanCaptureRefund(input: {
  provider: string;
  reference: string | null;
  providerTransactionId: string | null;
  outcome: "refunded" | "refund_failed";
  detail?: string | null;
}): Promise<"matched" | "unknown" | "error"> {
  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from("payment_orphan_capture")
    .select("id")
    .eq("provider", input.provider);
  if (input.reference) query = query.eq("provider_reference", input.reference);
  else if (input.providerTransactionId)
    query = query.eq("provider_transaction_id", input.providerTransactionId);
  else return "unknown";
  const { data, error } = await query.maybeSingle();
  if (error) {
    logger.error(`orphanCapture: refund lookup failed (${error.message})`);
    return "error";
  }
  if (!data) return "unknown";
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("payment_orphan_capture")
    .update(
      input.outcome === "refunded"
        ? { status: "refunded", refunded_at: now, updated_at: now }
        : {
            status: "refund_failed",
            last_error: input.detail ?? "refund failed at the provider",
            updated_at: now,
          },
    )
    .eq("id", data.id);
  if (updateError) {
    logger.error(
      `orphanCapture: refund update failed (${updateError.message})`,
    );
    return "error";
  }
  return "matched";
}
