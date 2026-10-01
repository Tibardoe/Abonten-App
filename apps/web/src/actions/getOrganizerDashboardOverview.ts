"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { requestTimeZone } from "@/utils/requestTimeZone";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type OrganizerDashboardOverviewResult,
  fetchOrganizerDashboardOverview,
} from "@abonten/services/organizer/organizerReadQuery";

export default withActionLocale(async function getOrganizerDashboardOverview(
  period: DashboardPeriod,
): Promise<OrganizerDashboardOverviewResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  return fetchOrganizerDashboardOverview(
    supabase,
    period,
    await requestTimeZone(),
  );
});
