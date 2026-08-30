"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import {
  type AddPayoutAccountInput,
  addPayoutAccountSchema,
} from "@/utils/payoutAccountSchema";
import type { PayoutAccountRow } from "@abonten/types/organizerFinance";
import { revalidatePath } from "next/cache";

type AddPayoutAccountResult =
  | { status: 400 | 401 | 500; message: string }
  | { status: 200; data: PayoutAccountRow };

/**
 * Saves a new organizer payout destination. The first account an organizer
 * adds is automatically their default, matching addPaymentMethod.ts's exact
 * precedent for the equivalent buyer-side flow.
 */
export default async function addPayoutAccount(
  input: AddPayoutAccountInput,
): Promise<AddPayoutAccountResult> {
  const parsed = addPayoutAccountSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid payout account",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { count, error: countError } = await supabase
    .from("payout_account")
    .select("id", { count: "exact", head: true })
    .eq("organizer_id", user.id)
    .eq("status", "active");

  if (countError) {
    logger.error(`Failed counting payout accounts: ${countError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const data = parsed.data;
  const accountHolderName = data.accountHolderName;
  const provider =
    data.accountType === "mobile_money" ? data.networkName : data.bankName;
  const accountNumber =
    data.accountType === "mobile_money" ? data.phone : data.accountNumber;

  const { data: inserted, error } = await supabase
    .from("payout_account")
    .insert({
      organizer_id: user.id,
      account_type: data.accountType,
      account_holder_name: accountHolderName,
      provider,
      account_number: accountNumber,
      is_default: (count ?? 0) === 0,
      status: "active",
    })
    .select(
      "id, account_type, account_holder_name, provider, account_number, is_default, created_at",
    )
    .single();

  if (error) {
    logger.error(`Failed saving payout account: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  revalidatePath("/finances/payout-accounts");

  return { status: 200, data: inserted as PayoutAccountRow };
}
