import {
  sendGateCodesReadyEmail,
  sendGateVoidEmail,
} from "@/utils/sendGatePartnerEmails";
import { logger } from "@abonten/core/logger";
import { dispatchGatePartnerPushes } from "@abonten/services/gatePartners/gatePushCore";
import { notifyGatePartnerVoidsCore } from "@abonten/services/gatePartners/gateVoidCore";
import { isDeliveryTokenValid } from "@abonten/services/notifications/deliveryCore";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// POST /api/jobs/gate-partners
//
// Gate partner connectors (docs/architecture/gate-partner-connectors.md).
// Called once a minute by the `gate-partners` pg_cron job
// (run_gate_partner_dispatch), only while something is due, with the
// notification-delivery token in `x-delivery-token`:
//   1. registers due sales with the partner and stores the codes it issues
//      (retries with backoff; the buyer is told when codes arrive late);
//   2. tells organizers which partner codes to void (tickets cancelled or
//      refunded on Abonten).
// Pushes are claimed with row locks, so an overlapping call never sends a
// sale twice; the idempotency key makes even a crashed send safe to repeat.
export async function POST(req: Request) {
  if (!(await isDeliveryTokenValid(req.headers.get("x-delivery-token")))) {
    logger.warn("jobs/gate-partners: rejected -- missing or wrong token");
    return NextResponse.json({ status: 401 }, { status: 401 });
  }
  const pushes = await dispatchGatePartnerPushes({
    budgetMs: 40_000,
    notifyBuyer: true,
    deps: { onCodesReady: sendGateCodesReadyEmail },
  });
  const voids = await notifyGatePartnerVoidsCore({
    sendVoidEmail: sendGateVoidEmail,
  });
  return NextResponse.json({ status: 200, pushes, voids }, { status: 200 });
}
