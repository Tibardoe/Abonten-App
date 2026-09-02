"use server";

import { createClient } from "@/config/supabase/server";
import {
  type MutatePayoutAccountResult,
  removePayoutAccountCore,
} from "@abonten/services/organizer/payoutAccountCore";
import { revalidatePath } from "next/cache";

/**
 * Soft-removes a payout account (status -> 'removed'), matching
 * removePaymentMethod.ts's precedent — historical payout rows keep
 * referencing it (payout.payout_account_id is ON DELETE RESTRICT, not
 * cascading, and a hard delete would break that history anyway). Blocked in
 * two safe-to-explain cases: it's the organizer's only account (never leave
 * them with zero payout destinations while other funds may still need one),
 * or it's the destination of a payout still 'processing' (removing it mid-
 * flight would orphan the in-progress request's destination).
 */
export default async function removePayoutAccount(
  payoutAccountId: string,
): Promise<MutatePayoutAccountResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const result = await removePayoutAccountCore(
    supabase,
    user.id,
    payoutAccountId,
  );

  if (result.status === 200) {
    revalidatePath("/finances/payout-accounts");
  }

  return result;
}
