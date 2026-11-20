"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getEventSeatingCore } from "@abonten/services/seating/seatingCore";

/**
 * The organizer's seating plans and an event's seating (plan, each ticket
 * type's section, seats given), for Manage › Details
 * (docs/architecture/assigned-seats.md).
 */
export default withActionLocale(async function getEventSeating(
  eventId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { status: 401 as const, message: tr("userNotAuthenticated") };
  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await actingFor(user.id, "events.manage");
  if (actor.error) return actor.error;
  return getEventSeatingCore(supabase, actor.accountId, eventId);
});
