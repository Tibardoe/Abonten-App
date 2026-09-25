// The safety net under the two ways a payment normally settles — the
// buyer's app verifying when it comes back from the provider, and the
// provider's webhook. If both are lost (the app is closed, the webhook
// secret is wrong, the endpoint is down past the provider's retries), a
// charge the provider completed would otherwise stay "initiated" for ever:
// the buyer paid, has no ticket, and the checkout's reserved tickets are
// never released (expire_stale_ticket_checkouts skips a checkout while an
// attempt on it is open). Two such test-mode charges from August 2026 were
// found exactly like that.
//
// Every few minutes the payment-reconcile cron posts to
// /api/maintenance/payment-reconcile, which calls this. Each open attempt
// that has a provider reference and is past its checkout window goes
// through finalizePayment — the same function the app and the webhook use,
// with its compare-and-swap lock, amount/currency checks and orphan-capture
// refund — so nothing here decides an outcome on its own:
//   provider says success  -> fulfilled (or refunded if the order closed)
//   abandoned / failed     -> attempt failed, checkout released next sweep
//   still pending / unreachable -> left open, tried again later.
// A `fulfillment_failed` attempt (the charge is recorded, the ticket or
// promotion was not issued — a QR upload or email step failed) is retried
// the same way, at most once every 30 minutes, until it is issued.
// Attempts older than the look-back window are left for a person (Admin ›
// Finance); the health check counts any still open.

import { timingSafeEqual } from "node:crypto";
import { CHECKOUT_RESERVATION_MINUTES } from "@abonten/core/checkoutExpiry";
import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { CREDIT_PROVIDER, finalizePayment } from "./finalizePayment";
import type { PaymentFulfillmentDeps } from "./fulfillmentDeps";

/** Past the checkout's hold, so a buyer still on the payment page is not cut off. */
export const RECONCILE_AFTER_MINUTES = CHECKOUT_RESERVATION_MINUTES + 5;
/** Older open attempts are reported, not retried automatically. */
export const RECONCILE_LOOKBACK_DAYS = 2;
/** An attempt touched more recently than this is left for the next sweep. */
export const RECONCILE_BACKOFF_MINUTES = 30;
const BATCH = 25;

/** The cron's `x-reconcile-token` against payment_reconcile_config. */
export async function isReconcileTokenValid(
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await getSupabaseServiceClient()
    .from("payment_reconcile_config")
    .select("token")
    .eq("id", true)
    .maybeSingle();
  if (error || !data?.token) {
    if (error) logger.error(`reconcile token read failed: ${error.message}`);
    return false;
  }
  const expected = Buffer.from(data.token);
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type ReconcileSummary = {
  checked: number;
  outcomes: Record<string, number>;
};

export async function reconcilePaymentAttemptsCore(
  deps: PaymentFulfillmentDeps,
  now: Date = new Date(),
): Promise<ReconcileSummary> {
  const supabase = getSupabaseServiceClient();
  const before = new Date(now.getTime() - RECONCILE_AFTER_MINUTES * 60_000);
  const since = new Date(now.getTime() - RECONCILE_LOOKBACK_DAYS * 86_400_000);
  const untouchedSince = new Date(
    now.getTime() - RECONCILE_BACKOFF_MINUTES * 60_000,
  );
  const { data, error } = await supabase
    .from("payment_attempt")
    .select("id")
    .in("status", ["initiated", "pending", "fulfillment_failed"])
    .not("provider_reference", "is", null)
    .neq("provider", CREDIT_PROVIDER)
    .lt("created_at", before.toISOString())
    .gte("created_at", since.toISOString())
    // A verify or webhook that just touched it (a pending mobile-money
    // approval, a failed issuance) gets its half hour before the sweep
    // asks the provider again.
    .lt("updated_at", untouchedSince.toISOString())
    // Least recently tried first, so one that stays pending cannot starve
    // the rest of the batch.
    .order("updated_at", { ascending: true })
    .limit(BATCH);
  if (error)
    throw new Error(`reconcile: listing attempts failed (${error.message})`);

  const outcomes: Record<string, number> = {};
  for (const row of data ?? []) {
    let status: string;
    try {
      status = (await finalizePayment(row.id, deps)).status;
    } catch (e) {
      status = "error";
      logger.error(
        `reconcile: finalizePayment threw for attempt ${row.id} (${e instanceof Error ? e.message : String(e)})`,
      );
    }
    outcomes[status] = (outcomes[status] ?? 0) + 1;
    if (status === "succeeded" || status === "fulfillment_failed") {
      // Settled here, not by the app or the webhook: worth knowing about.
      logger.warn(
        `reconcile: attempt ${row.id} settled by the sweep (${status})`,
      );
    }
  }
  return { checked: data?.length ?? 0, outcomes };
}
