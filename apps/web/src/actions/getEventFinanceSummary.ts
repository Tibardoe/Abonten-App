"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type EventFinanceSummary,
  fetchEventFinanceSummary,
} from "@abonten/services/organizer/eventInsightsQuery";

export type { EventFinanceSummary };

/**
 * One event's contribution to the organizer's Finances balance — reads the
 * same organizer_ledger_entry rows Finances itself reads, so this can never
 * disagree with the Finances page. `data: null` means this event hasn't
 * produced any recorded earnings yet (e.g. no paid sales), which is a valid,
 * distinct case from a 403 (not this organizer's event). Query body shared
 * with the mobile route via @/utils/eventInsightsQuery.
 */
export default withActionLocale(async function getEventFinanceSummary(
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

  return fetchEventFinanceSummary(
    supabase,
    actor.accountId,
    eventId,
    startDate,
    endDate,
  );
});
