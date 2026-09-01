import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { fetchEventInsights } from "@/utils/eventInsightsQuery";
import { logger } from "@abonten/core/logger";
import {
  type DashboardPeriod,
  getDashboardPeriodRange,
} from "@abonten/core/organizerDashboardDateRange";

const PERIODS: DashboardPeriod[] = ["today", "7d", "30d", "all"];

// GET /api/mobile/organizer/events/:eventId/analytics?period=today|7d|30d|all
// The signed-in organizer's full Event Insights payload (overview, finance,
// ticket-type / promo / per-date breakdowns, returning-attendee stats) for
// the chosen period, in one call. Mirrors the six lazy per-section Server
// Actions the web /manage/events/[eventId] Insights tab uses, aggregated —
// see @/utils/eventInsightsQuery. 403 if the event isn't the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { eventId } = await params;
    if (!eventId) {
      return apiJson({ status: 400, message: "Missing event id" });
    }

    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("period");
    const period: DashboardPeriod =
      raw && (PERIODS as string[]).includes(raw)
        ? (raw as DashboardPeriod)
        : "all";

    const { start, end } = getDashboardPeriodRange(period);
    const result = await fetchEventInsights(
      auth.supabase,
      auth.user.id,
      eventId,
      start?.toISOString() ?? null,
      end?.toISOString() ?? null,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile GET /organizer/events/:eventId/analytics failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
