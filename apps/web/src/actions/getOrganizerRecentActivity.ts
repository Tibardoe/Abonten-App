"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { fetchOrganizerRecentActivity } from "@abonten/services/organizer/organizerDashboardQuery";

export default withActionLocale(async function getOrganizerRecentActivity(
  limit = 8,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: tr("userNotLoggedIn") };
  }

  return fetchOrganizerRecentActivity(supabase, limit);
});
