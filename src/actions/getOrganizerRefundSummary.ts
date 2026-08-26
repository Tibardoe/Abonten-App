"use server";

import { createClient } from "@/config/supabase/server";
import type { OrganizerRefundSummaryRow } from "@/types/organizerFinance";

type GetOrganizerRefundSummaryResult =
  | { status: 401 | 500; message: string }
  | { status: 200; data: OrganizerRefundSummaryRow[] };

/**
 * Organizer-wide pending/completed refund totals for the Finances Overview
 * "Refunds" section — mirrors getEventFinanceSummary.ts's event-scoped
 * breakdown but without the event filter (get_organizer_refund_breakdown).
 */
export default async function getOrganizerRefundSummary(): Promise<GetOrganizerRefundSummaryResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { data, error } = await supabase.rpc("get_organizer_refund_breakdown");

  if (error) {
    console.log(`Failed fetching organizer refund summary: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return {
    status: 200,
    data: (data ?? []) as OrganizerRefundSummaryRow[],
  };
}
