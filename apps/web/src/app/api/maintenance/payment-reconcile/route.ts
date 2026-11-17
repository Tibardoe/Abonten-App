import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import { logger } from "@abonten/core/logger";
import { retryOrphanRefundsCore } from "@abonten/services/payments/orphanRefundRetryCore";
import {
  isReconcileTokenValid,
  reconcilePaymentAttemptsCore,
} from "@abonten/services/payments/reconcilePaymentAttemptsCore";
import { retryOwedRefundsCore } from "@abonten/services/payments/retryOwedRefundsCore";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// POST /api/maintenance/payment-reconcile
//
// Settles payments that neither the buyer's app nor the provider's webhook
// finished (reconcilePaymentAttemptsCore), then asks again for refunds the
// provider refused or that were never sent (retryOwedRefundsCore). Called
// every 5 minutes by the `payment-reconcile` pg_cron job, only while such an
// attempt or refund exists, with the token from payment_reconcile_config in
// the `x-reconcile-token` header. Each attempt goes through finalizePayment's
// lock and each refund through refund_prepare's, so an overlapping call, the
// app and the webhook can never settle one twice.
export async function POST(req: Request) {
  if (!(await isReconcileTokenValid(req.headers.get("x-reconcile-token")))) {
    logger.warn(
      "maintenance/payment-reconcile: rejected -- missing or wrong token",
    );
    return NextResponse.json({ status: 401 }, { status: 401 });
  }
  const started = Date.now();
  let failed = false;
  let summary: Awaited<ReturnType<typeof reconcilePaymentAttemptsCore>> | null =
    null;
  try {
    summary = await reconcilePaymentAttemptsCore(paymentFulfillmentDeps);
  } catch (e) {
    failed = true;
    logger.error("maintenance/payment-reconcile failed", e);
  }
  // The cron waits 55 s for an answer: no new refund starts after 40 s.
  let refunds: Awaited<ReturnType<typeof retryOwedRefundsCore>> | null = null;
  try {
    refunds = await retryOwedRefundsCore({ deadline: started + 40_000 });
  } catch (e) {
    failed = true;
    logger.error("maintenance/payment-reconcile: refund retry failed", e);
  }
  // Charges with no order (a card check, a payment taken after its order
  // closed) whose refund was refused or never sent.
  let chargesWithNoOrder: Awaited<
    ReturnType<typeof retryOrphanRefundsCore>
  > | null = null;
  try {
    chargesWithNoOrder = await retryOrphanRefundsCore({
      deadline: started + 45_000,
    });
  } catch (e) {
    failed = true;
    logger.error(
      "maintenance/payment-reconcile: orphan refund retry failed",
      e,
    );
  }
  if (failed) {
    return NextResponse.json({ status: 500 }, { status: 500 });
  }
  return NextResponse.json({
    status: 200,
    ...summary,
    refunds,
    chargesWithNoOrder,
  });
}
