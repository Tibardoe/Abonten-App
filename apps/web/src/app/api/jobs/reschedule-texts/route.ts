import { logger } from "@abonten/core/logger";
import { dispatchRescheduleTextsCore } from "@abonten/services/events/rescheduleTextsCore";
import { isDeliveryTokenValid } from "@abonten/services/notifications/deliveryCore";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// POST /api/jobs/reschedule-texts
//
// Sends the text messages queued when an organizer moved or postponed an
// event (docs/architecture/event-reschedule.md). Called once a minute by
// the `reschedule-texts` pg_cron job (run_reschedule_text_dispatch), only
// while a text is due, with the notification-delivery token in
// `x-delivery-token`. Rows are claimed with row locks, so an overlapping
// call cannot text anyone twice.
export async function POST(req: Request) {
  if (!(await isDeliveryTokenValid(req.headers.get("x-delivery-token")))) {
    logger.warn("jobs/reschedule-texts: rejected -- missing or wrong token");
    return NextResponse.json({ status: 401 }, { status: 401 });
  }
  const result = await dispatchRescheduleTextsCore({ budgetMs: 45_000 });
  return NextResponse.json({ status: 200, ...result }, { status: 200 });
}
