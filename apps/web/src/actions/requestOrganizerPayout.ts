"use server";

import { createClient } from "@/config/supabase/server";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  type RequestOrganizerPayoutResult,
  requestOrganizerPayoutCore,
} from "@abonten/services/organizer/requestOrganizerPayoutCore";

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

  const result = await requestOrganizerPayoutCore(supabase, {
    payoutAccountId,
    amount,
    currency,
  });

  if (result.status === 200) {
    revalidateAppPath("/finances");
    revalidateAppPath("/finances/payouts");
    revalidateAppPath("/finances/transactions");
    revalidateAppPath("/manage/dashboard");
  }

  return result;
}
