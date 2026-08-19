"use server";

import { createClient } from "@/config/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Marks one payout account as the organizer's default, unsetting any
 * previous default first — same two-step approach as
 * setDefaultPaymentMethod.ts, safe under the payout_account_one_default_per_organizer
 * partial unique index.
 */
export default async function setDefaultPayoutAccount(payoutAccountId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: account, error: fetchError } = await supabase
    .from("payout_account")
    .select("id")
    .eq("id", payoutAccountId)
    .eq("organizer_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (fetchError) {
    console.log(`Failed fetching payout account: ${fetchError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!account) {
    return { status: 404, message: "Payout account not found" };
  }

  const { error: unsetError } = await supabase
    .from("payout_account")
    .update({ is_default: false, updated_at: new Date() })
    .eq("organizer_id", user.id)
    .eq("is_default", true)
    .neq("id", payoutAccountId);

  if (unsetError) {
    console.log(`Failed clearing previous default: ${unsetError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const { error: setError } = await supabase
    .from("payout_account")
    .update({ is_default: true, updated_at: new Date() })
    .eq("id", payoutAccountId)
    .eq("organizer_id", user.id)
    .eq("status", "active");

  if (setError) {
    console.log(`Failed setting default payout account: ${setError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  revalidatePath("/finances/payout-accounts");

  return { status: 200, message: "Default payout account updated" };
}
