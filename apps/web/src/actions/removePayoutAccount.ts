"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
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
export default async function removePayoutAccount(payoutAccountId: string) {
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
    .select("id, is_default")
    .eq("id", payoutAccountId)
    .eq("organizer_id", user.id)
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
    .eq("organizer_id", user.id)
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
    .eq("organizer_id", user.id);

  if (removeError) {
    logger.error(`Failed removing payout account: ${removeError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (account.is_default) {
    const { data: nextDefault } = await supabase
      .from("payout_account")
      .select("id")
      .eq("organizer_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (nextDefault) {
      await supabase
        .from("payout_account")
        .update({ is_default: true, updated_at: new Date() })
        .eq("id", nextDefault.id)
        .eq("organizer_id", user.id);
    }
  }

  revalidatePath("/finances/payout-accounts");

  return { status: 200, message: "Payout account removed" };
}
