"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import type { OrganizerPayoutRow } from "@abonten/types/organizerFinance";

type GetOrganizerPayoutsResult =
  | { status: 401 | 500; message: string }
  | { status: 200; data: OrganizerPayoutRow[] };

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
): Promise<GetOrganizerPayoutsResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { data, error } = await supabase
    .from("payout")
    .select(
      "id, amount, currency, status, reference, requested_at, processed_at",
    )
    .eq("organizer_id", user.id)
    .order("requested_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error(`Failed fetching payouts: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: (data ?? []) as OrganizerPayoutRow[] };
}
