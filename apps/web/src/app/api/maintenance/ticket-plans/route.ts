import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import { logger } from "@abonten/core/logger";
import { isReconcileTokenValid } from "@abonten/services/payments/reconcilePaymentAttemptsCore";
import { runTicketPlanMaintenanceCore } from "@abonten/services/ticketPlans/ticketPlanMaintenanceCore";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// POST /api/maintenance/ticket-plans
//
// The Pay small small job (runTicketPlanMaintenanceCore): ends plans whose
// hold ran out, whose deadline passed, whose event was cancelled or whose
// owner closed their account; asks the provider for planned refund shares;
// finishes settlements that did not complete; sends reminders. Called every
// five minutes by the `ticket-plans-dispatch` pg_cron job, only while
// ticket_plan_work_due() finds something, with the payment-reconcile token
// (payment_reconcile_config) in the `x-reconcile-token` header. Every step
// locks what it touches, so an overlapping call is harmless.
export async function POST(req: Request) {
  if (!(await isReconcileTokenValid(req.headers.get("x-reconcile-token")))) {
    logger.warn("maintenance/ticket-plans: rejected -- missing or wrong token");
    return NextResponse.json({ status: 401 }, { status: 401 });
  }
  try {
    const summary = await runTicketPlanMaintenanceCore(paymentFulfillmentDeps);
    return NextResponse.json({ status: 200, ...summary });
  } catch (e) {
    logger.error("maintenance/ticket-plans failed", e);
    return NextResponse.json({ status: 500 }, { status: 500 });
  }
}
