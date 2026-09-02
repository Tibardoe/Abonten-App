"use server";

import { createClient } from "@/config/supabase/server";
import { fetchOrganizerUpcomingEvents } from "@/utils/organizerDashboardQuery";

export default async function getOrganizerUpcomingEvents(limit = 5) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: "User not logged in" };
  }

  return fetchOrganizerUpcomingEvents(supabase, limit);
}
