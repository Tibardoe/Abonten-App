// Provider webhooks, handled once for every provider. The route handler
// (apps/web /api/payments/webhook/[provider]/[country], and the legacy
// /api/paystack/webhook alias) only reads the raw body and headers, calls
// this, and writes the status back. Nothing here trusts the payload until
// the market's provider adapter has verified the signature with THAT
// market's webhook secret.
//
// Idempotency: every accepted delivery is recorded in payment_webhook_event
// keyed by (provider, country, event id); a redelivery of an event already
// processed to a settled outcome is acknowledged without re-running it.
// Payment outcomes still go through finalizePayment's own compare-and-swap
// lock, so even a delivery that slips past the log can never double-issue.
//
// Ack rule (see webhookAck.ts): 200 only for settled outcomes; 503 asks the
// provider to redeliver (Paystack and Stripe both retry on non-2xx).

import { logger } from "@abonten/core/logger";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { fromMajor } from "@abonten/core/money/money";
import type { Database, Json } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { getMarket } from "../markets/marketConfig";
import { createNotificationCore } from "../notifications/createNotification";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { type FinalizeResult, finalizePayment } from "./finalizePayment";
import type { PaymentFulfillmentDeps } from "./fulfillmentDeps";
import { markOrphanCaptureRefund } from "./orphanCapture";
import {
  accountFromConfig,
  getPaymentProvider,
  isPaymentProviderCode,
} from "./providers/registry";
import type {
  NormalizedWebhookEvent,
  ProviderAccount,
} from "./providers/types";
import {
  WEBHOOK_ACK_OK,
  WEBHOOK_ACK_RETRY,
  webhookAckStatus,
} from "./webhookAck";

export type WebhookHandlerResult = {
  status: number;
  body: Record<string, unknown>;
};

async function resolveAccount(
  providerCode: string,
  countryCode: string,
): Promise<ProviderAccount | null> {
  const market = await getMarket(countryCode);
  if (!market) return null;
  const config = market.paymentProviders.find(
    (p) => p.provider === providerCode,
  );
  if (!config) return null;
  return accountFromConfig(market, config);
}

async function findTransaction(
  supabase: ServiceRoleClient,
  provider: string,
  ref: { reference: string | null; providerTransactionId: string | null },
  select: string,
) {
  if (ref.reference) {
    const { data } = await supabase
      .from("transaction")
      .select(select)
      .eq("provider", provider)
      .eq("provider_reference", ref.reference)
      .maybeSingle();
    if (data) return data as unknown as Record<string, unknown>;
  }
  if (ref.providerTransactionId) {
    const { data } = await supabase
      .from("transaction")
      .select(select)
      .eq("provider", provider)
      .eq("provider_transaction_id", ref.providerTransactionId)
      .maybeSingle();
    if (data) return data as unknown as Record<string, unknown>;
  }
  return null;
}

async function handlePaymentOutcome(
  supabase: ServiceRoleClient,
  provider: string,
  reference: string,
  deps: PaymentFulfillmentDeps,
): Promise<{
  status: number;
  body: Record<string, unknown>;
  settled: boolean;
}> {
  const { data: attempt, error } = await supabase
    .from("payment_attempt")
    .select("id")
    .eq("provider", provider)
    .eq("provider_reference", reference)
    .maybeSingle();

  if (error) {
    logger.error(
      `webhook: failed looking up attempt for ${provider}/${reference} (${error.message})`,
    );
    return {
      status: WEBHOOK_ACK_RETRY,
      body: { error: "Server error" },
      settled: false,
    };
  }
  if (!attempt) {
    // A charge Abonten never started (a dashboard test, another system on
    // the same account). Nothing to finalise, nothing to retry.
    logger.info(
      `webhook: no payment_attempt for ${provider} reference ${reference}`,
    );
    return {
      status: WEBHOOK_ACK_OK,
      body: { received: true, ignored: "unknown_reference" },
      settled: true,
    };
  }

  const result: FinalizeResult = await finalizePayment(attempt.id, deps);
  const status = webhookAckStatus(result);
  return {
    status,
    body: { received: true, finalized: result.status },
    settled: status === WEBHOOK_ACK_OK,
  };
}

async function handleRefundOutcome(
  supabase: ServiceRoleClient,
  provider: string,
  event: Extract<
    NormalizedWebhookEvent,
    { type: "refund.processed" | "refund.failed" }
  >,
): Promise<{
  status: number;
  body: Record<string, unknown>;
  settled: boolean;
}> {
  const match = await findTransaction(supabase, provider, event, "id, status");
  if (!match) {
    // Not an order: possibly the refund of a charge that arrived after its
    // order had closed (orphanCapture.ts).
    const orphan = await markOrphanCaptureRefund({
      provider,
      reference: event.reference,
      providerTransactionId: event.providerTransactionId,
      outcome: event.type === "refund.processed" ? "refunded" : "refund_failed",
      detail: event.type === "refund.failed" ? event.detail : null,
    });
    if (orphan === "error") {
      return {
        status: WEBHOOK_ACK_RETRY,
        body: { error: "Server error" },
        settled: false,
      };
    }
    logger.info(
      `webhook: ${event.type} for ${provider} — ${orphan === "matched" ? "orphan capture updated" : "no matching transaction"}`,
    );
    return {
      status: WEBHOOK_ACK_OK,
      body: {
        received: true,
        ...(orphan === "matched" ? {} : { ignored: "unknown_transaction" }),
      },
      settled: true,
    };
  }
  const newStatus =
    event.type === "refund.processed" ? "refunded" : "successful";

  // Only transitions a transaction that is actually awaiting this
  // confirmation — a retried delivery, or one that arrives after this was
  // resolved another way, is a no-op rather than clobbering a later state.
  // A failed refund also releases the in-flight refund claim so the
  // customer or an admin can retry straight away.
  const { data: updated, error: updateError } = await supabase
    .from("transaction")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
      ...(event.type === "refund.failed" ? { refund_claimed_at: null } : {}),
    })
    .eq("id", match.id as string)
    .eq("status", "refund_pending")
    .select("id, user_id, currency, credit_refunded_amount")
    .maybeSingle();

  if (updateError) {
    logger.error(
      `webhook: failed updating transaction for ${event.type} (${updateError.message})`,
    );
    return {
      status: WEBHOOK_ACK_RETRY,
      body: { error: "Server error" },
      settled: false,
    };
  }
  if (!updated) {
    return {
      status: WEBHOOK_ACK_OK,
      body: { received: true, ignored: "not_refund_pending" },
      settled: true,
    };
  }

  logger.info(
    `webhook: transaction ${updated.id} -> ${newStatus} via ${event.type}`,
  );

  // A failed refund means the money never left the organizer: reverse the
  // hold recorded when the refund was requested (cash share only — credit
  // was already returned to the buyer).
  if (newStatus === "successful") {
    const { error: releaseError } = await supabase.rpc(
      "record_refund_release",
      {
        p_transaction_id: updated.id,
      },
    );
    if (releaseError) {
      logger.error(
        `webhook: failed recording refund release for transaction ${updated.id}: ${releaseError.message}`,
      );
    }
  }

  const creditReturned = Number(updated.credit_refunded_amount ?? 0);
  const creditText =
    creditReturned > 0
      ? formatMoney(fromMajor(creditReturned, updated.currency))
      : null;

  await createNotificationCore(supabase, {
    userId: updated.user_id,
    type: newStatus === "refunded" ? "refund_completed" : "refund_failed",
    title:
      newStatus === "refunded"
        ? "Refund completed"
        : "Refund couldn't be completed",
    body:
      newStatus === "refunded"
        ? "Your refund has been sent back to your payment method."
        : creditText
          ? `Your ${creditText} of Abonten Credit is back, but we couldn't return the rest to your payment method automatically. Our team will follow up.`
          : "We couldn't process your refund automatically. Our team will follow up.",
    link: "/transactions",
    data: { kind: "ticket" },
  }).catch((error) => {
    logger.error(
      `webhook: failed sending refund notification for transaction ${updated.id}: ${error}`,
    );
  });

  return { status: WEBHOOK_ACK_OK, body: { received: true }, settled: true };
}

async function handleDispute(
  supabase: ServiceRoleClient,
  provider: string,
  event: Extract<
    NormalizedWebhookEvent,
    { type: "dispute.opened" | "dispute.updated" | "dispute.closed" }
  >,
): Promise<{
  status: number;
  body: Record<string, unknown>;
  settled: boolean;
}> {
  // record_payment_dispute matches on provider + reference; when only the
  // provider transaction id is known (Stripe), look the reference up first.
  let reference = event.reference;
  if (!reference && event.providerTransactionId) {
    const tx = await findTransaction(
      supabase,
      provider,
      event,
      "provider_reference",
    );
    reference = (tx?.provider_reference as string | undefined) ?? null;
  }
  // The RPC's arguments are nullable in SQL but the generated types don't
  // say so (same generator gap the organizer dashboard call documents).
  const args = {
    p_provider_dispute_id: event.disputeId,
    p_provider_reference: reference,
    p_event:
      event.type === "dispute.opened"
        ? "charge.dispute.create"
        : event.type === "dispute.closed"
          ? "charge.dispute.resolve"
          : "charge.dispute.remind",
    p_status: event.status,
    p_resolution: event.resolution,
    p_amount_minor: event.amount?.amountMinor ?? null,
    p_currency: event.amount?.currency ?? null,
    p_raw: (event.raw ?? {}) as Json,
    p_provider: provider,
  };
  const { error } = await supabase.rpc(
    "record_payment_dispute",
    args as unknown as Database["public"]["Functions"]["record_payment_dispute"]["Args"],
  );
  if (error) {
    logger.error(`webhook: record_payment_dispute failed (${error.message})`);
    return {
      status: WEBHOOK_ACK_RETRY,
      body: { error: "Server error" },
      settled: false,
    };
  }
  return { status: WEBHOOK_ACK_OK, body: { received: true }, settled: true };
}

async function handleTransfer(
  supabase: ServiceRoleClient,
  event: Extract<
    NormalizedWebhookEvent,
    { type: "transfer.success" | "transfer.failed" | "transfer.reversed" }
  >,
): Promise<{
  status: number;
  body: Record<string, unknown>;
  settled: boolean;
}> {
  if (!event.transferCode)
    return { status: WEBHOOK_ACK_OK, body: { received: true }, settled: true };
  const succeeded = event.type === "transfer.success";
  const nextTransferStatus = succeeded
    ? "success"
    : event.type === "transfer.reversed"
      ? "reversed"
      : "failed";

  // A reversal can arrive after the transfer succeeded (the bank sent
  // the money back): the payout is then reversed and the organizer's
  // balance restored, once (record_payout_reversal).
  if (event.type === "transfer.reversed") {
    const { data: done } = await supabase
      .from("payout")
      .select("id, status")
      .eq("transfer_code", event.transferCode)
      .maybeSingle();
    if (done?.status === "completed" || done?.status === "reversed") {
      const { error: reverseErr } = await supabase.rpc(
        "record_payout_reversal",
        {
          p_payout_id: done.id,
          p_reason: event.detail ?? "Transfer reversed by the provider",
        },
      );
      if (reverseErr) {
        logger.error(
          `webhook: record_payout_reversal failed for payout ${done.id} (${reverseErr.message})`,
        );
        return {
          status: WEBHOOK_ACK_RETRY,
          body: { error: "Server error" },
          settled: false,
        };
      }
      return {
        status: WEBHOOK_ACK_OK,
        body: { received: true },
        settled: true,
      };
    }
  }

  const { data: payout, error: payoutErr } = await supabase
    .from("payout")
    .update({
      transfer_status: nextTransferStatus,
      transfer_failure_reason: succeeded ? null : (event.detail ?? event.type),
      updated_at: new Date().toISOString(),
    })
    .eq("transfer_code", event.transferCode)
    .eq("transfer_status", "pending")
    .select("id")
    .maybeSingle();

  if (payoutErr) {
    logger.error(
      `webhook: failed updating payout for ${event.type} (${payoutErr.message})`,
    );
    return {
      status: WEBHOOK_ACK_RETRY,
      body: { error: "Server error" },
      settled: false,
    };
  }
  if (!payout) {
    logger.info(
      `webhook: ${event.type} for transfer ${event.transferCode} — no pending payout matched`,
    );
    return { status: WEBHOOK_ACK_OK, body: { received: true }, settled: true };
  }
  const { error: settleErr } = await supabase.rpc("admin_settle_payout", {
    p_payout_id: payout.id,
    p_status: succeeded ? "completed" : "failed",
    p_failure_reason: succeeded ? undefined : (event.detail ?? event.type),
  });
  if (settleErr) {
    logger.error(
      `webhook: admin_settle_payout failed for payout ${payout.id} (${settleErr.message})`,
    );
    return {
      status: WEBHOOK_ACK_RETRY,
      body: { error: "Server error" },
      settled: false,
    };
  }
  return { status: WEBHOOK_ACK_OK, body: { received: true }, settled: true };
}

export async function handleProviderWebhook(input: {
  providerCode: string;
  countryCode: string;
  rawBody: string;
  headers: Headers;
  deps: PaymentFulfillmentDeps;
}): Promise<WebhookHandlerResult> {
  const { providerCode, rawBody, headers, deps } = input;
  const countryCode = input.countryCode.toUpperCase();
  if (!isPaymentProviderCode(providerCode)) {
    return { status: 404, body: { error: "Unknown provider" } };
  }
  const account = await resolveAccount(providerCode, countryCode);
  if (!account) {
    logger.error(`webhook: ${providerCode}/${countryCode} is not configured`);
    return { status: 500, body: { error: "Webhook not configured" } };
  }
  const provider = getPaymentProvider(providerCode);
  const parsed = provider.parseWebhook(account, rawBody, headers);
  if (!parsed.ok) {
    logger.warn(
      `Rejected ${providerCode} webhook for ${countryCode}: ${parsed.reason}`,
    );
    return {
      status: parsed.reason === "malformed" ? 400 : 401,
      body: { error: parsed.reason },
    };
  }

  const supabase = getSupabaseServiceClient();

  // Delivery log: a redelivery of an event already settled is acknowledged
  // without doing the work again.
  const { data: seen } = await supabase
    .from("payment_webhook_event")
    .select("outcome, attempts")
    .eq("provider", providerCode)
    .eq("country_code", countryCode)
    .eq("event_id", parsed.eventId)
    .maybeSingle();
  if (seen?.outcome === "settled") {
    return {
      status: WEBHOOK_ACK_OK,
      body: { received: true, duplicate: true },
    };
  }

  const event = parsed.event;
  let outcome: {
    status: number;
    body: Record<string, unknown>;
    settled: boolean;
  };
  switch (event.type) {
    case "payment.succeeded":
    case "payment.failed":
      outcome = await handlePaymentOutcome(
        supabase,
        providerCode,
        event.reference,
        deps,
      );
      break;
    case "refund.processed":
    case "refund.failed":
      outcome = await handleRefundOutcome(supabase, providerCode, event);
      break;
    case "dispute.opened":
    case "dispute.updated":
    case "dispute.closed":
      outcome = await handleDispute(supabase, providerCode, event);
      break;
    case "transfer.success":
    case "transfer.failed":
    case "transfer.reversed":
      outcome = await handleTransfer(supabase, event);
      break;
    default:
      outcome = {
        status: WEBHOOK_ACK_OK,
        body: { received: true, ignored: event.eventName },
        settled: true,
      };
  }

  await supabase
    .from("payment_webhook_event")
    .upsert(
      {
        provider: providerCode,
        country_code: countryCode,
        event_id: parsed.eventId,
        event_name: parsed.eventName,
        outcome: outcome.settled ? "settled" : "retry",
        http_status: outcome.status,
        attempts: (seen?.attempts ?? 0) + 1,
        last_received_at: new Date().toISOString(),
      },
      { onConflict: "provider,country_code,event_id" },
    )
    .then(({ error }) => {
      if (error)
        logger.error(`webhook: failed logging delivery (${error.message})`);
    });

  return { status: outcome.status, body: outcome.body };
}
