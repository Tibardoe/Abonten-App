"use server";

import { createClient } from "@/config/supabase/server";
import { fetchEventReturningAttendeeStats } from "@/utils/eventInsightsQuery";

export default async function getEventReturningAttendeeStats(
  eventId: string,
  startDate?: string | null,
  endDate?: string | null,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: "User not logged in" };
  }

  return fetchEventReturningAttendeeStats(
    supabase,
    user.id,
    eventId,
    startDate,
    endDate,
  );
}
