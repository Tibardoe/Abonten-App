"use server";

import { createClient } from "@/config/supabase/server";
import type { OrganizerPayoutDetail } from "@/types/organizerFinance";
import { logger } from "@/utils/logger";

type GetOrganizerPayoutDetailResult =
  | { status: 401 | 403 | 404 | 500; message: string }
  | { status: 200; data: OrganizerPayoutDetail };

/**
 * A single payout's detail view. Ownership is enforced by filtering on
 * organizer_id server-side (never trusting the payoutId alone) — matches
 * getEventOverviewAnalytics.ts's ownership-check pattern.
 */
export default async function getOrganizerPayoutDetail(
  payoutId: string,
): Promise<GetOrganizerPayoutDetailResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { data, error } = await supabase
    .from("payout")
    .select(
      "id, amount, currency, status, reference, failure_reason, requested_at, processed_at, payout_account:payout_account_id(account_type, account_holder_name, provider, account_number)",
    )
    .eq("id", payoutId)
    .eq("organizer_id", user.id)
    .maybeSingle();

  if (error) {
    logger.error(`Failed fetching payout detail: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!data) {
    return { status: 404, message: "Payout not found" };
  }

  return {
    status: 200,
    data: data as unknown as OrganizerPayoutDetail,
  };
}
