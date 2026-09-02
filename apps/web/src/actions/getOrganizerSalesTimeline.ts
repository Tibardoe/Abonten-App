"use server";

import { createClient } from "@/config/supabase/server";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { fetchOrganizerSalesTimeline } from "@abonten/services/organizer/organizerDashboardQuery";

export default async function getOrganizerSalesTimeline(
  period: DashboardPeriod,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: "User not logged in" };
  }

  return fetchOrganizerSalesTimeline(supabase, period);
}
