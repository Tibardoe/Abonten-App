"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { requestTimeZone } from "@/utils/requestTimeZone";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type OrganizerDashboardResult,
  fetchOrganizerDashboard,
} from "@abonten/services/organizer/organizerDashboardQuery";

/**
 * The organizer dashboard in one answer: the KPI overview (this period and
 * the one before it), the sales timeline, the best-selling events, what is
 * coming up, what needs attention and recent activity.
 *
 * The page used to ask for each of these with its own action, six in a
 * row (a browser runs Server Actions one at a time), each with its own
 * session check and its own trip to the database. get_organizer_dashboard
 * answers them in one SQL call; the native app has read it that way since
 * 2026-09-10 (GET /api/mobile/organizer/dashboard, same service).
 */
export default withActionLocale(async function getOrganizerDashboard(
  period: DashboardPeriod,
): Promise<OrganizerDashboardResult | { status: 401; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  return fetchOrganizerDashboard(supabase, period, await requestTimeZone());
});
