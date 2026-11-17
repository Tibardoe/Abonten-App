// The charges-with-no-order half of the payment-reconcile sweep (migration
// 20261117150029_card_check_refunds). A payment_orphan_capture row is money
// a provider took that Abonten owes back in full: the small charge made to
// save a card, or a payment that arrived after its order had closed. When
// the provider refused the refund (Paystack: "Insufficient balance to
// process refund" on a new live account) or it was never sent, this asks
// again, one at a time, through the same provider account that took it.
//
// orphan_refund_retry_candidates() keeps the pace (30 minutes between tries,
// at most ten, rows from the last 14 days); after ten refusals the
// dispatcher opens fin_reconciliation.orphan_refunds_refused instead. The
// refund.processed webhook marks the row refunded (markOrphanCaptureRefund).

import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { resolveProviderAccount } from "./providers/registry";

/** Rows asked for per sweep, one after another. */
export const ORPHAN_REFUND_RETRY_BATCH = 5;

export type OrphanRefundRetrySummary = {
  checked: number;
  outcomes: Record<string, number>;
};

type Candidate = {
  id: string;
  provider: string;
  country_code: string;
  provider_reference: string;
  provider_transaction_id: string | null;
  currency: string;
  attempts: number;
};

export async function retryOrphanRefundsCore(opts: {
  /** No new refund is started after this instant (ms since the epoch). */
  deadline: number;
  now?: () => number;
}): Promise<OrphanRefundRetrySummary> {
  const now = opts.now ?? Date.now;
  const service = getSupabaseServiceClient();
  const { data, error } = await service.rpc("orphan_refund_retry_candidates", {
    p_limit: ORPHAN_REFUND_RETRY_BATCH,
  });
  if (error) {
    logger.error(
      `orphan refund retry: candidates read failed: ${error.message}`,
    );
    throw new Error(error.message);
  }

  const outcomes: Record<string, number> = {};
  let checked = 0;
  for (const row of (data ?? []) as Candidate[]) {
    if (now() >= opts.deadline) break;
    checked += 1;
    const stamp = new Date().toISOString();
    let outcome: "refund_requested" | "refund_failed";
    let detail: string | null = null;
    try {
      const { provider, account } = await resolveProviderAccount({
        countryCode: row.country_code,
        currency: row.currency,
        providerCode: row.provider,
      });
      await provider.refund(account, {
        reference: row.provider_reference,
        providerTransactionId: row.provider_transaction_id,
        amount: null,
      });
      outcome = "refund_requested";
    } catch (e) {
      outcome = "refund_failed";
      detail = e instanceof Error ? e.message : String(e);
      logger.warn(
        `orphan refund retry: ${row.provider_reference} refused again (${row.attempts + 1} tries): ${detail}`,
      );
    }
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    const { error: updateError } = await service
      .from("payment_orphan_capture")
      .update(
        outcome === "refund_requested"
          ? {
              status: "refund_requested",
              refund_requested_at: stamp,
              attempts: row.attempts + 1,
              last_error: null,
              updated_at: stamp,
            }
          : {
              status: "refund_failed",
              last_error: detail,
              attempts: row.attempts + 1,
              updated_at: stamp,
            },
      )
      .eq("id", row.id)
      // Only from where it was: a refund settled meanwhile stays settled.
      .in("status", ["refund_failed", "detected"]);
    if (updateError) {
      logger.error(
        `orphan refund retry: ${row.id} not recorded (${updateError.message})`,
      );
    }
  }
  return { checked, outcomes };
}
