"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { fetchEventTicketTypeAnalytics } from "@abonten/services/organizer/eventInsightsQuery";

export default withActionLocale(async function getEventTicketTypeAnalytics(
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
    return { status: 401 as const, message: tr("userNotLoggedIn") };
  }

  return fetchEventTicketTypeAnalytics(
    supabase,
    user.id,
    eventId,
    startDate,
    endDate,
  );
});
