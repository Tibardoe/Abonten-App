"use server";

import { createClient } from "@/config/supabase/server";
import {
  type ListPayoutAccountsResult,
  listPayoutAccountsCore,
} from "@abonten/services/organizer/payoutAccountCore";

/**
 * Every active payout destination for the current organizer — separate
 * from getUserPaymentMethods (buyer payment methods) and from the per-event
 * receiving_account rows, per this feature's explicit "don't mix the two
 * concepts" requirement.
 */
export default async function getOrganizerPayoutAccounts(): Promise<ListPayoutAccountsResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  return listPayoutAccountsCore(supabase, user.id);
}
