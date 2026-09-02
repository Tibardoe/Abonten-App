"use server";

import { createClient } from "@/config/supabase/server";
import {
  type OrganizerFinanceOverviewResult,
  fetchOrganizerFinanceOverview,
} from "@abonten/services/organizer/organizerReadQuery";

/**
 * The single balance figure every surface reads — Finances Overview, the
 * Dashboard's lightweight finance summary, and Event Insights all call this
 * exact action/RPC (get_organizer_finance_overview), so the numbers shown
 * on each can never drift apart.
 */
export default async function getOrganizerFinanceOverview(): Promise<OrganizerFinanceOverviewResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  return fetchOrganizerFinanceOverview(supabase);
}
