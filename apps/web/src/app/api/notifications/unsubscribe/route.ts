import { logger } from "@abonten/core/logger";
import { setRewardEmailsByTokenCore } from "@abonten/services/notifications/rewardEmailPreferenceCore";
import { NextResponse } from "next/server";

// POST /api/notifications/unsubscribe?u=<user id>&t=<signed token>
//
// One-click unsubscribe (RFC 8058) for Abonten Rewards emails: the address
// in their `List-Unsubscribe` header, which Gmail, Yahoo and Outlook call
// when someone presses the mail app's own "Unsubscribe" button. It only
// accepts POST, so link scanners that open URLs can't unsubscribe anyone;
// people clicking the link in the email land on /unsubscribe/rewards
// instead, which asks first.
export async function POST(req: Request) {
  const url = new URL(req.url);
  try {
    const res = await setRewardEmailsByTokenCore({
      userId: url.searchParams.get("u"),
      token: url.searchParams.get("t"),
      enabled: false,
    });
    return NextResponse.json(
      { status: res.status, message: res.message },
      { status: res.status },
    );
  } catch (e) {
    logger.error("notifications/unsubscribe failed", e);
    return NextResponse.json({ status: 500 }, { status: 500 });
  }
}
