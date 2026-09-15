import { logger } from "@abonten/core/logger";
import { setRecommendationEmailsByTokenCore } from "@abonten/services/notifications/recommendationEmailPreferenceCore";
import { setRewardEmailsByTokenCore } from "@abonten/services/notifications/rewardEmailPreferenceCore";
import { NextResponse } from "next/server";

// POST /api/notifications/unsubscribe?[topic=recommendations&]u=<user id>&t=<signed token>
//
// One-click unsubscribe (RFC 8058): the address in the `List-Unsubscribe`
// header of Abonten Rewards emails (no topic) and recommendation digest
// emails (topic=recommendations), which Gmail, Yahoo and Outlook call when
// someone presses the mail app's own "Unsubscribe" button. Each topic has its
// own signing key, so a rewards link can't unsubscribe from anything else.
// It only accepts POST, so link scanners that open URLs can't unsubscribe
// anyone; people clicking the link in the email land on /unsubscribe/rewards
// or /unsubscribe/recommendations instead, which ask first.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("u");
  const token = url.searchParams.get("t");
  try {
    const res =
      url.searchParams.get("topic") === "recommendations"
        ? await setRecommendationEmailsByTokenCore({
            userId,
            token,
            source: "email_one_click",
          })
        : await setRewardEmailsByTokenCore({ userId, token, enabled: false });
    return NextResponse.json(
      { status: res.status, message: res.message },
      { status: res.status },
    );
  } catch (e) {
    logger.error("notifications/unsubscribe failed", e);
    return NextResponse.json({ status: 500 }, { status: 500 });
  }
}
