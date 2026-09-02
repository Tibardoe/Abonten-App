"use server";

import { createClient } from "@/config/supabase/server";
import {
  type ListPayoutsResult,
  listPayoutsCore,
} from "@abonten/services/organizer/payoutAccountCore";

/**
 * The organizer's withdrawal history for Finances > Payouts. Paginated with
 * a simple offset since payout volume per organizer is orders of magnitude
 * smaller than the transaction ledger (one row per withdrawal, not per
 * ticket sale) — cursor pagination isn't needed here the way it is for
 * getOrganizerLedgerTransactions.
 */
export default async function getOrganizerPayouts(
  offset = 0,
  limit = 20,
): Promise<ListPayoutsResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  return listPayoutsCore(supabase, user.id, offset, limit);
}
