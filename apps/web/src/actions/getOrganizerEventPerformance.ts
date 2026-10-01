"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { requestTimeZone } from "@/utils/requestTimeZone";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { tr } from "@abonten/services/i18n/requestLocale";
import { fetchOrganizerEventPerformance } from "@abonten/services/organizer/organizerDashboardQuery";

export default withActionLocale(async function getOrganizerEventPerformance(
  period: DashboardPeriod,
  sort: "revenue" | "tickets" = "revenue",
  limit = 10,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: tr("userNotLoggedIn") };
  }

  return fetchOrganizerEventPerformance(
    supabase,
    period,
    sort,
    limit,
    await requestTimeZone(),
  );
});
