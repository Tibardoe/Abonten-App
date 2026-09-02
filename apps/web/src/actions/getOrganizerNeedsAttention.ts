"use server";

import { createClient } from "@/config/supabase/server";
import { fetchOrganizerNeedsAttention } from "@/utils/organizerDashboardQuery";

export default async function getOrganizerNeedsAttention(daysSoon = 7) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: "User not logged in" };
  }

  return fetchOrganizerNeedsAttention(supabase, daysSoon);
}
