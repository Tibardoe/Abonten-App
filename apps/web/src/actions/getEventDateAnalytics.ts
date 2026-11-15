"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { fetchEventDateAnalytics } from "@abonten/services/organizer/eventInsightsQuery";

export default withActionLocale(async function getEventDateAnalytics(
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

  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await actingFor(user.id, "money.view");
  if (actor.error) return actor.error;

  return fetchEventDateAnalytics(
    supabase,
    actor.accountId,
    eventId,
    startDate,
    endDate,
  );
});
