import { logger } from "@abonten/core/logger";
import type {
  OrganizerPayoutRow,
  PayoutAccountRow,
} from "@abonten/types/organizerFinance";
import { addPayoutAccountSchema } from "@abonten/validation/payoutAccountSchema";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth bodies for an organizer's payout destinations + withdrawal
// history, shared by the Server Actions (cookie session) and the mobile
// HTTP routes (Bearer session). Both receive an already-authenticated
// `supabase` client plus the resolved `userId`, so every `.eq("organizer_id",
// userId)` scope and every guard is identical on either transport — no logic
// fork. `revalidatePath` is Next-specific and stays in the action wrappers.

const ACCOUNT_COLUMNS =
  "id, account_type, account_holder_name, provider, account_number, is_default, created_at";

export type ListPayoutAccountsResult =
  | { status: 401 | 500; message: string }
  | { status: 200; data: PayoutAccountRow[] };

export type AddPayoutAccountResult =
  | { status: 400 | 401 | 500; message: string }
  | { status: 200; data: PayoutAccountRow };

export type MutatePayoutAccountResult = {
  status: 200 | 400 | 401 | 404 | 500;
  message: string;
};

export type ListPayoutsResult =
  | { status: 401 | 500; message: string }
  | { status: 200; data: OrganizerPayoutRow[] };

export async function listPayoutAccountsCore(
  supabase: SupabaseClient,
  userId: string,
): Promise<ListPayoutAccountsResult> {
  const { data, error } = await supabase
    .from("payout_account")
    .select(ACCOUNT_COLUMNS)
    .eq("organizer_id", userId)
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    logger.error(`Failed fetching payout accounts: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: (data ?? []) as PayoutAccountRow[] };
}

export async function addPayoutAccountCore(
  supabase: SupabaseClient,
  userId: string,
  input: unknown,
): Promise<AddPayoutAccountResult> {
  const parsed = addPayoutAccountSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid payout account",
    };
  }

  const { count, error: countError } = await supabase
    .from("payout_account")
    .select("id", { count: "exact", head: true })
    .eq("organizer_id", userId)
    .eq("status", "active");

  if (countError) {
    logger.error(`Failed counting payout accounts: ${countError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const data = parsed.data;
  const provider =
    data.accountType === "mobile_money" ? data.networkName : data.bankName;
  const accountNumber =
    data.accountType === "mobile_money" ? data.phone : data.accountNumber;

  const { data: inserted, error } = await supabase
    .from("payout_account")
    .insert({
      organizer_id: userId,
      account_type: data.accountType,
      account_holder_name: data.accountHolderName,
      provider,
      account_number: accountNumber,
      is_default: (count ?? 0) === 0,
      status: "active",
    })
    .select(ACCOUNT_COLUMNS)
    .single();

  if (error) {
    logger.error(`Failed saving payout account: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: inserted as PayoutAccountRow };
}

export async function removePayoutAccountCore(
  supabase: SupabaseClient,
  userId: string,
  payoutAccountId: string,
): Promise<MutatePayoutAccountResult> {
  const { data: account, error: fetchError } = await supabase
    .from("payout_account")
    .select("id, is_default")
    .eq("id", payoutAccountId)
    .eq("organizer_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (fetchError) {
    logger.error(`Failed fetching payout account: ${fetchError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!account) {
    return { status: 404, message: "Payout account not found" };
  }

  const { count: activeCount, error: countError } = await supabase
    .from("payout_account")
    .select("id", { count: "exact", head: true })
    .eq("organizer_id", userId)
    .eq("status", "active");

  if (countError) {
    logger.error(`Failed counting payout accounts: ${countError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if ((activeCount ?? 0) <= 1) {
    return {
      status: 400,
      message: "You must keep at least one payout account",
    };
  }

  const { count: processingCount, error: processingError } = await supabase
    .from("payout")
    .select("id", { count: "exact", head: true })
    .eq("payout_account_id", payoutAccountId)
    .eq("status", "processing");

  if (processingError) {
    logger.error(
      `Failed checking in-flight payouts: ${processingError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  if ((processingCount ?? 0) > 0) {
    return {
      status: 400,
      message: "This account has a payout in progress and can't be removed yet",
    };
  }

  const { error: removeError } = await supabase
    .from("payout_account")
    .update({ status: "removed", is_default: false, updated_at: new Date() })
    .eq("id", payoutAccountId)
    .eq("organizer_id", userId);

  if (removeError) {
    logger.error(`Failed removing payout account: ${removeError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (account.is_default) {
    const { data: nextDefault } = await supabase
      .from("payout_account")
      .select("id")
      .eq("organizer_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (nextDefault) {
      await supabase
        .from("payout_account")
        .update({ is_default: true, updated_at: new Date() })
        .eq("id", nextDefault.id)
        .eq("organizer_id", userId);
    }
  }

  return { status: 200, message: "Payout account removed" };
}

export async function setDefaultPayoutAccountCore(
  supabase: SupabaseClient,
  userId: string,
  payoutAccountId: string,
): Promise<MutatePayoutAccountResult> {
  const { data: account, error: fetchError } = await supabase
    .from("payout_account")
    .select("id")
    .eq("id", payoutAccountId)
    .eq("organizer_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (fetchError) {
    logger.error(`Failed fetching payout account: ${fetchError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!account) {
    return { status: 404, message: "Payout account not found" };
  }

  const { error: unsetError } = await supabase
    .from("payout_account")
    .update({ is_default: false, updated_at: new Date() })
    .eq("organizer_id", userId)
    .eq("is_default", true)
    .neq("id", payoutAccountId);

  if (unsetError) {
    logger.error(`Failed clearing previous default: ${unsetError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const { error: setError } = await supabase
    .from("payout_account")
    .update({ is_default: true, updated_at: new Date() })
    .eq("id", payoutAccountId)
    .eq("organizer_id", userId)
    .eq("status", "active");

  if (setError) {
    logger.error(`Failed setting default payout account: ${setError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Default payout account updated" };
}

export async function listPayoutsCore(
  supabase: SupabaseClient,
  userId: string,
  offset = 0,
  limit = 20,
): Promise<ListPayoutsResult> {
  const { data, error } = await supabase
    .from("payout")
    .select(
      "id, amount, currency, status, reference, requested_at, processed_at",
    )
    .eq("organizer_id", userId)
    .order("requested_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error(`Failed fetching payouts: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: (data ?? []) as OrganizerPayoutRow[] };
}
