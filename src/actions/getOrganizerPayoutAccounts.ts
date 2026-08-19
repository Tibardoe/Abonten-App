"use server";

import { createClient } from "@/config/supabase/server";
import type { PayoutAccountRow } from "@/types/organizerFinance";

type GetOrganizerPayoutAccountsResult =
  | { status: 401 | 500; message: string }
  | { status: 200; data: PayoutAccountRow[] };

/**
 * Every active payout destination for the current organizer — separate
 * from getUserPaymentMethods (buyer payment methods) and from the per-event
 * receiving_account rows, per this feature's explicit "don't mix the two
 * concepts" requirement.
 */
export default async function getOrganizerPayoutAccounts(): Promise<GetOrganizerPayoutAccountsResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { data, error } = await supabase
    .from("payout_account")
    .select(
      "id, account_type, account_holder_name, provider, account_number, is_default, created_at",
    )
    .eq("organizer_id", user.id)
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.log(`Failed fetching payout accounts: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: (data ?? []) as PayoutAccountRow[] };
}
