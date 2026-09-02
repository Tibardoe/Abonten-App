"use server";

import { createClient } from "@/config/supabase/server";
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
export default async function getEventFinanceSummary(
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
    return { status: 401 as const, message: "User not logged in" };
  }

  return fetchEventFinanceSummary(
    supabase,
    user.id,
    eventId,
    startDate,
    endDate,
  );
}
