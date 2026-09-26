import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { calendarZoneOrDefault } from "@abonten/services/markets/calendarZone";
import { fetchOrganizerDashboardOverview } from "@abonten/services/organizer/organizerReadQuery";

const PERIODS: DashboardPeriod[] = ["today", "7d", "30d", "all"];

// GET /api/mobile/organizer/overview?period=today|7d|30d|all&tz=<IANA zone>
// The signed-in organizer's dashboard KPIs for the period (and the
// comparison window). Same body as the getOrganizerDashboardOverview action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("period");
    const period: DashboardPeriod =
      raw && (PERIODS as string[]).includes(raw)
        ? (raw as DashboardPeriod)
        : "30d";

    const timeZone = await calendarZoneOrDefault(searchParams.get("tz"));
    const result = await fetchOrganizerDashboardOverview(
      auth.supabase,
      period,
      timeZone,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /organizer/overview failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
