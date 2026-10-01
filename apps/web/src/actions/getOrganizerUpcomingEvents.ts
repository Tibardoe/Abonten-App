"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { fetchOrganizerUpcomingEvents } from "@abonten/services/organizer/organizerDashboardQuery";

// Declared on its own, then wrapped: passed inline, the wrapper would give
// the defaulted parameters its own (unknown) type instead of their default.
async function getOrganizerUpcomingEvents(limit = 5) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: tr("userNotLoggedIn") };
  }

  return fetchOrganizerUpcomingEvents(supabase, limit);
}

export default withActionLocale(getOrganizerUpcomingEvents);
