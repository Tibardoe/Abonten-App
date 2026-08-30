"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import {
  type DashboardPeriod,
  getDashboardPeriodRange,
} from "@/utils/organizerDashboardDateRange";

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

  const { start, end } = getDashboardPeriodRange(period);

  const { data, error } = await supabase.rpc(
    "get_organizer_event_performance",
    {
      p_start: start ? start.toISOString() : null,
      p_end: end ? end.toISOString() : null,
      p_sort: sort,
      p_limit: limit,
    },
  );

  if (error) {
    logger.error("Supabase error:", error.message);
    return { status: 500 as const, message: "Something went wrong!" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  return { status: 200 as const, data: (data ?? []) as any[] };
}
