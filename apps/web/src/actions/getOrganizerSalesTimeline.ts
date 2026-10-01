"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { requestTimeZone } from "@/utils/requestTimeZone";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { tr } from "@abonten/services/i18n/requestLocale";
import { fetchOrganizerSalesTimeline } from "@abonten/services/organizer/organizerDashboardQuery";

export default withActionLocale(async function getOrganizerSalesTimeline(
  period: DashboardPeriod,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: tr("userNotLoggedIn") };
  }

  return fetchOrganizerSalesTimeline(supabase, period, await requestTimeZone());
});
