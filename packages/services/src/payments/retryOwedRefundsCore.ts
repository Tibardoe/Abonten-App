// The refunds half of the payment-reconcile sweep (migration
// 20261116230148_refund_retry_sweep). A cancelled ticket of a cash payment
// is owed its money back; when the provider refused the request (Paystack
// takes one refund per account at a time) or the request that cancelled it
// died before asking, nothing else would ask again. Every few minutes the
// payment-reconcile cron posts to /api/maintenance/payment-reconcile while
// such a payment exists, and this asks again through issueRefundCore, the
// same function the buyer's Retry refund and Admin › Finance use: it re-runs
// refund_prepare under the payment's lock, so nothing here decides who is
// owed what or how much.
//
// refund_retry_candidates() keeps the pace: a ticket cancelled in the last
// 15 minutes is left to the request that cancelled it, a payment waits 30
// minutes after any refund part, and after five refused parts the sweep
// stops and the dispatcher opens a reconciliation incident instead.

import { logger } from "@abonten/core/logger";
import { issueRefundCore } from "../organizer/issueRefundCore";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

/** Payments asked for per sweep, one after another (never side by side). */
export const REFUND_RETRY_BATCH = 5;

export type RefundRetrySummary = {
  checked: number;
  outcomes: Record<string, number>;
};

type Candidate = { transaction_id: string; failed_parts: number };

export async function retryOwedRefundsCore(opts: {
  /** No new refund is started after this instant (ms since the epoch). */
  deadline: number;
  now?: () => number;
}): Promise<RefundRetrySummary> {
  const now = opts.now ?? Date.now;
  const service = getSupabaseServiceClient();
  const { data, error } = await service.rpc("refund_retry_candidates", {
    p_limit: REFUND_RETRY_BATCH,
  });
  if (error) {
    logger.error(`refund retry: candidates read failed: ${error.message}`);
    throw new Error(error.message);
  }

  const outcomes: Record<string, number> = {};
  let checked = 0;
  for (const row of (data ?? []) as Candidate[]) {
    if (now() >= opts.deadline) break;
    checked += 1;
    const result = await issueRefundCore(service, row.transaction_id).catch(
      (e: unknown) => {
        logger.error(`refund retry: ${row.transaction_id} threw: ${String(e)}`);
        return null;
      },
    );
    const key = result ? String(result.status) : "threw";
    outcomes[key] = (outcomes[key] ?? 0) + 1;
    if (result?.status !== 200) {
      logger.warn(
        `refund retry: ${row.transaction_id} not requested (refused ${row.failed_parts} time(s) before): ${result?.message ?? "error"}`,
      );
    }
  }
  return { checked, outcomes };
}
