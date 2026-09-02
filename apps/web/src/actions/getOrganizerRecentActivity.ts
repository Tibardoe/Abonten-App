"use server";

import { createClient } from "@/config/supabase/server";
import { fetchOrganizerRecentActivity } from "@abonten/services/organizer/organizerDashboardQuery";

export default async function getOrganizerRecentActivity(limit = 8) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: "User not logged in" };
  }

  return fetchOrganizerRecentActivity(supabase, limit);
}
