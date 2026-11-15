"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import {
  type EventCancellationImpact,
  type EventCancellationImpactResult,
  getEventCancellationImpactCore,
} from "@abonten/services/events/cancelEventCore";
import { tr } from "@abonten/services/i18n/requestLocale";

export type { EventCancellationImpact };

/**
 * Server-verified counts for the cancel-event confirmation dialog -- never
 * trust client-side assumptions about how many attendees/paid tickets an
 * event has. Backed by the get_event_cancellation_impact RPC, which has to
 * be SECURITY DEFINER since ticket/attendance RLS is scoped to the ticket
 * holder's own user_id, not the organizer.
 */
export default withActionLocale(async function getEventCancellationImpact(
  eventId: string,
): Promise<EventCancellationImpactResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await actingFor(user.id, ["events.manage", "refunds.issue"], {
    all: true,
  });
  if (actor.error) return actor.error;

  return getEventCancellationImpactCore(
    supabase,
    eventId,
    actor.role ? actor.accountId : null,
  );
});
