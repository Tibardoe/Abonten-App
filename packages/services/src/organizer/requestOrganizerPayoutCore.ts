import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of requestOrganizerPayout, shared by the Server Action
// (cookie session) and the mobile HTTP route (Bearer session). All
// authorization + balance validation lives inside the request_organizer_payout
// RPC (it re-verifies payout-account ownership against auth.uid() and
// recomputes the available balance from the ledger), so this helper never
// trusts a client-supplied balance and only shape-checks the amount.
// `revalidatePath` is Next-specific and stays in the action wrapper.

export type RequestOrganizerPayoutResult =
  | { status: 400 | 401 | 500; message: string; balanceStale?: boolean }
  | { status: 200; data: { payoutId: string; reference: string } };

export async function requestOrganizerPayoutCore(
  supabase: SupabaseClient<Database>,
  input: { payoutAccountId: string; amount: number; currency: string },
): Promise<RequestOrganizerPayoutResult> {
  const { payoutAccountId, amount, currency } = input;

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
    logger.error(`Failed requesting payout: ${error.message}`);
    const balanceStale = error.message.includes("exceeds available balance");
    const message = balanceStale
      ? "Your available balance has changed. Please review your updated balance before withdrawing."
      : error.message.includes("Invalid payout account")
        ? "Select a valid payout account"
        : "Something went wrong. Please try again";

    return { status: 400, message, balanceStale };
  }

  const result = data as { payout_id: string; reference: string };

  return {
    status: 200,
    data: { payoutId: result.payout_id, reference: result.reference },
  };
}
