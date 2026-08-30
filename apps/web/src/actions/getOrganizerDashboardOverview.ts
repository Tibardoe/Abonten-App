"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import {
  type DashboardPeriod,
  getDashboardPeriodRange,
} from "@/utils/organizerDashboardDateRange";

export default async function getOrganizerDashboardOverview(
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

  const { start, end, prevStart, prevEnd } = getDashboardPeriodRange(period);

  const [currentResult, previousResult] = await Promise.all([
    supabase.rpc("get_organizer_dashboard_overview", {
      p_start: start ? start.toISOString() : null,
      p_end: end ? end.toISOString() : null,
    }),
    prevStart && prevEnd
      ? supabase.rpc("get_organizer_dashboard_overview", {
          p_start: prevStart.toISOString(),
          p_end: prevEnd.toISOString(),
        })
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (currentResult.error) {
    logger.error("Supabase error:", currentResult.error.message);
    return { status: 500 as const, message: "Something went wrong!" };
  }

  return {
    status: 200 as const,
    data: {
      // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
      current: (currentResult.data ?? []) as any[],
      previous: previousResult.error
        ? null
        : previousResult.data === null
          ? null
          : // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
            (previousResult.data as any[]),
    },
  };
}
