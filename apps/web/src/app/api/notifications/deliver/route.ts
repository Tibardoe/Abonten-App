import { sendRecommendationDigestEmail } from "@/utils/sendRecommendationDigestEmail";
import { sendRewardUpdateEmail } from "@/utils/sendRewardUpdateEmail";
import { logger } from "@abonten/core/logger";
import {
  deliverQueuedNotificationsCore,
  isDeliveryTokenValid,
} from "@abonten/services/notifications/deliveryCore";
import { pollPushReceiptsCore } from "@abonten/services/notifications/pushReceiptsCore";
import { isRecommendationEmailKillSwitchOn } from "@abonten/services/search/discoveryProgram";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// POST /api/notifications/deliver
//
// Sends queued pushes and emails (rewards, SQL-written app notices,
// recommendation digests), then reads due Expo push receipts. Called once a
// minute by the `notification-delivery` pg_cron job
// (run_notification_delivery), only while something is due, with the token
// from notification_delivery_config in the `x-delivery-token` header. The
// queue lives in the database, so a repeated or overlapping call can't send
// anything twice.
export async function POST(req: Request) {
  if (!(await isDeliveryTokenValid(req.headers.get("x-delivery-token")))) {
    logger.warn("notifications/deliver: rejected -- missing or wrong token");
    return NextResponse.json({ status: 401 }, { status: 401 });
  }

  const res = await deliverQueuedNotificationsCore({
    sendEmail: sendRewardUpdateEmail,
    // Recommendation email is gated by legal item G1 in the database; this
    // env switch stops it on this deployment regardless.
    sendRecommendationEmail: isRecommendationEmailKillSwitchOn()
      ? undefined
      : sendRecommendationDigestEmail,
  });
  const receipts = await pollPushReceiptsCore().catch((e) => {
    logger.error(`notifications/deliver: receipts failed: ${e}`);
    return null;
  });
  return NextResponse.json(
    { ...res, receipts: receipts?.data ?? null },
    { status: res.status },
  );
}
