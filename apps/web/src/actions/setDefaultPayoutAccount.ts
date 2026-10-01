"use server";

import { createClient } from "@/config/supabase/server";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  type MutatePayoutAccountResult,
  setDefaultPayoutAccountCore,
} from "@abonten/services/organizer/payoutAccountCore";

/**
 * Marks one payout account as the organizer's default, unsetting any
 * previous default first — same two-step approach as
 * setDefaultPaymentMethod.ts, safe under the payout_account_one_default_per_organizer
 * partial unique index.
 */
export default async function setDefaultPayoutAccount(
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

  const result = await setDefaultPayoutAccountCore(
    supabase,
    user.id,
    payoutAccountId,
  );

  if (result.status === 200) {
    revalidateAppPath("/finances/payout-accounts");
  }

  return result;
}
