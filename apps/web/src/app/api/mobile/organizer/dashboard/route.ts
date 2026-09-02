import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { fetchOrganizerDashboardWidgets } from "@abonten/services/organizer/organizerDashboardQuery";

const PERIODS: DashboardPeriod[] = ["today", "7d", "30d", "all"];

// GET /api/mobile/organizer/dashboard?period=today|7d|30d|all
// Every Dashboard widget section (sales timeline, event performance,
// upcoming events, needs attention, recent activity) in one call — the
// mobile Dashboard's aggregate read, mirroring the web page's five
// getOrganizer* section actions.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const raw = new URL(req.url).searchParams.get("period");
    const period: DashboardPeriod =
      raw && (PERIODS as string[]).includes(raw)
        ? (raw as DashboardPeriod)
        : "30d";

    const result = await fetchOrganizerDashboardWidgets(auth.supabase, period);
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /organizer/dashboard failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
