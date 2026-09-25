import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import { logger } from "@abonten/core/logger";
import {
  isReconcileTokenValid,
  reconcilePaymentAttemptsCore,
} from "@abonten/services/payments/reconcilePaymentAttemptsCore";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// POST /api/maintenance/payment-reconcile
//
// Settles payments that neither the buyer's app nor the provider's webhook
// finished (reconcilePaymentAttemptsCore). Called every 5 minutes by the
// `payment-reconcile` pg_cron job, only while such an attempt exists, with
// the token from payment_reconcile_config in the `x-reconcile-token`
// header. Each attempt goes through finalizePayment's lock, so an
// overlapping call, the app and the webhook can never settle one twice.
export async function POST(req: Request) {
  if (!(await isReconcileTokenValid(req.headers.get("x-reconcile-token")))) {
    logger.warn(
      "maintenance/payment-reconcile: rejected -- missing or wrong token",
    );
    return NextResponse.json({ status: 401 }, { status: 401 });
  }
  try {
    const summary = await reconcilePaymentAttemptsCore(paymentFulfillmentDeps);
    return NextResponse.json({ status: 200, ...summary });
  } catch (e) {
    logger.error("maintenance/payment-reconcile failed", e);
    return NextResponse.json({ status: 500 }, { status: 500 });
  }
}
