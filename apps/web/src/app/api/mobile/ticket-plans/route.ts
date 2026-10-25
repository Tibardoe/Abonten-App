import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import {
  listTicketPlansCore,
  startTicketPlanCore,
} from "@abonten/services/ticketPlans/ticketPlanCore";
import type { ReferralHint } from "@abonten/types/rewards";
import { startTicketPlanSchema } from "@abonten/validation/ticketPlanSchemas";

// GET /api/mobile/ticket-plans — the person's plans, open ones first.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const res = apiJson(await listTicketPlansCore(auth.user.id));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    logger.error("mobile GET /ticket-plans failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}

// POST /api/mobile/ticket-plans
//   { eventId, occurrenceId?, quantities: { [ticketTypeId]: number },
//     referral?: { code, touchedAt, source? } }
// Locks the price and holds the seats (startTicketPlanCore, the same the
// web action runs); the first part is paid from the plan screen.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const parsed = startTicketPlanSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? tr("invalidInput"),
      });
    }

    // The referral link the app captured for this event: a hint only,
    // re-validated server-side before anything is stamped.
    const referral = body?.referral as {
      code?: unknown;
      touchedAt?: unknown;
      source?: unknown;
    } | null;
    const referralHints: ReferralHint[] | null =
      referral &&
      typeof referral.code === "string" &&
      typeof referral.touchedAt === "string"
        ? [
            {
              code: referral.code,
              touchedAt: referral.touchedAt,
              eventId: parsed.data.eventId,
              source:
                referral.source === "qr" ||
                referral.source === "install_referrer"
                  ? referral.source
                  : "link",
            },
          ]
        : null;

    return apiJson(
      await startTicketPlanCore(auth.user.id, {
        ...parsed.data,
        referralHints,
      }),
    );
  } catch (error) {
    logger.error("mobile POST /ticket-plans failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
