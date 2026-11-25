import { sendGateCodesReadyEmail } from "@/utils/sendGatePartnerEmails";
import { logger } from "@abonten/core/logger";
import { dispatchGatePartnerPushes } from "@abonten/services/gatePartners/gatePushCore";
import { handleGatePartnerWebhookCore } from "@abonten/services/gatePartners/gateWebhookCore";
import { NextResponse, after } from "next/server";

export const maxDuration = 30;

// POST /api/gate-partners/:provider/webhook (Hapniin: /api/gate-partners/
// hapniin/webhook, set in the partner's portal).
//
// A gate partner tells us an order attributed to Abonten is paid
// (order.completed). The signature (HMAC of the raw body) is checked against
// the webhook secrets named on the provider's links; a valid one for one of
// our sales confirms it and, when its codes are not stored yet, fetches them
// after the response. Answered within the partner's 10 seconds; anything we
// do not use is acknowledged so the partner stops retrying.
// (docs/architecture/gate-partner-connectors.md §3.4)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider } = await params;
    const rawBody = await req.text();
    const result = await handleGatePartnerWebhookCore(
      provider,
      rawBody,
      req.headers,
    );
    if (result.pushDue) {
      after(() =>
        dispatchGatePartnerPushes({
          budgetMs: 20_000,
          notifyBuyer: true,
          deps: { onCodesReady: sendGateCodesReadyEmail },
        }).then(
          () => undefined,
          (error) => logger.error(`gate webhook dispatch failed: ${error}`),
        ),
      );
    }
    return NextResponse.json(
      { ok: result.status === 200 },
      { status: result.status },
    );
  } catch (error) {
    logger.error("Gate partner webhook failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
