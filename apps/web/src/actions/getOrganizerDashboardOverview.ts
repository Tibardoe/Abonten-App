"use server";

import { createClient } from "@/config/supabase/server";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import {
  type OrganizerDashboardOverviewResult,
  fetchOrganizerDashboardOverview,
} from "@abonten/services/organizer/organizerReadQuery";

export default async function getOrganizerDashboardOverview(
  period: DashboardPeriod,
): Promise<OrganizerDashboardOverviewResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  return fetchOrganizerDashboardOverview(supabase, period);
}
