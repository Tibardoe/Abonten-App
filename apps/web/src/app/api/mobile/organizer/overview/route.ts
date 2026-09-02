import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { fetchOrganizerDashboardOverview } from "@abonten/services/organizer/organizerReadQuery";

const PERIODS: DashboardPeriod[] = ["today", "7d", "30d", "all"];

// GET /api/mobile/organizer/overview?period=today|7d|30d|all
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

    const result = await fetchOrganizerDashboardOverview(auth.supabase, period);
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /organizer/overview failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
