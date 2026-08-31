"use server";

import { createClient } from "@/config/supabase/server";
import {
  type AddPayoutAccountResult,
  addPayoutAccountCore,
} from "@/utils/payoutAccountCore";
import type { AddPayoutAccountInput } from "@abonten/validation/payoutAccountSchema";
import { revalidatePath } from "next/cache";

/**
 * Saves a new organizer payout destination. The first account an organizer
 * adds is automatically their default, matching addPaymentMethod.ts's exact
 * precedent for the equivalent buyer-side flow.
 */
export default async function addPayoutAccount(
  input: AddPayoutAccountInput,
): Promise<AddPayoutAccountResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const result = await addPayoutAccountCore(supabase, user.id, input);

  if (result.status === 200) {
    revalidatePath("/finances/payout-accounts");
  }

  return result;
}
