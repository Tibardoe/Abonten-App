"use server";

import { createClient } from "@/config/supabase/server";
import { revalidatePath } from "next/cache";

type RequestOrganizerPayoutResult =
  | { status: 400 | 401 | 500; message: string; balanceStale?: boolean }
  | { status: 200; data: { payoutId: string; reference: string } };

/**
 * Requests a withdrawal. All authorization/validation is server-side inside
 * the request_organizer_payout RPC: it re-verifies the payout account
 * belongs to this organizer and recomputes the available balance from the
 * ledger itself — this action never trusts a client-supplied balance or
 * amount beyond basic shape. The RPC only creates a 'processing' hold; it
 * never calls a Paystack transfer API and never marks the payout completed
 * (see the migration's header comment on payout fulfillment scope) — that
 * connection is intentionally left for a later task.
 */
export default async function requestOrganizerPayout(
  payoutAccountId: string,
  amount: number,
  currency: string,
): Promise<RequestOrganizerPayoutResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { status: 400, message: "Enter an amount greater than zero" };
  }

  const { data, error } = await supabase
    .rpc("request_organizer_payout", {
      p_payout_account_id: payoutAccountId,
      p_amount: amount,
      p_currency: currency,
    })
    .single();

  if (error) {
    console.log(`Failed requesting payout: ${error.message}`);
    const balanceStale = error.message.includes("exceeds available balance");
    const message = balanceStale
      ? "Your available balance has changed. Please review your updated balance before withdrawing."
      : error.message.includes("Invalid payout account")
        ? "Select a valid payout account"
        : "Something went wrong. Please try again";

    return { status: 400, message, balanceStale };
  }

  const result = data as { payout_id: string; reference: string };

  revalidatePath("/finances");
  revalidatePath("/finances/payouts");
  revalidatePath("/finances/transactions");
  revalidatePath("/manage/dashboard");

  return {
    status: 200,
    data: { payoutId: result.payout_id, reference: result.reference },
  };
}
