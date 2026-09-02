"use server";

import { createClient } from "@/config/supabase/server";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { fetchOrganizerEventPerformance } from "@abonten/services/organizer/organizerDashboardQuery";

export default async function getOrganizerEventPerformance(
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
    return { status: 401 as const, message: "User not logged in" };
  }

  return fetchOrganizerEventPerformance(supabase, period, sort, limit);
}
