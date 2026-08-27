"use server";

import { createClient } from "@/config/supabase/server";
import type { OrganizerFinanceOverviewRow } from "@/types/organizerFinance";
import { logger } from "@/utils/logger";

type GetOrganizerFinanceOverviewResult =
  | { status: 401 | 500; message: string }
  | { status: 200; data: OrganizerFinanceOverviewRow[] };

/**
 * The single balance figure every surface reads — Finances Overview, the
 * Dashboard's lightweight finance summary, and Event Insights all call this
 * exact action/RPC (get_organizer_finance_overview), so the numbers shown
 * on each can never drift apart.
 */
export default async function getOrganizerFinanceOverview(): Promise<GetOrganizerFinanceOverviewResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { data, error } = await supabase.rpc("get_organizer_finance_overview");

  if (error) {
    logger.error(
      `Failed fetching organizer finance overview: ${error.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  return {
    status: 200,
    data: (data ?? []) as OrganizerFinanceOverviewRow[],
  };
}
