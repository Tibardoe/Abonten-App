"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import type { OrganizerPayoutDetail } from "@abonten/types/organizerFinance";

type GetOrganizerPayoutDetailResult =
  | { status: 401 | 403 | 404 | 500; message: string }
  | { status: 200; data: OrganizerPayoutDetail };

/**
 * A single payout's detail view. Ownership is enforced by filtering on
 * organizer_id server-side (never trusting the payoutId alone) — matches
 * getEventOverviewAnalytics.ts's ownership-check pattern.
 */
export default withActionLocale(async function getOrganizerPayoutDetail(
  payoutId: string,
): Promise<GetOrganizerPayoutDetailResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await actingFor(user.id, "payout.view");
  if (actor.error) return actor.error;

  const { data, error } = await supabase
    .from("payout")
    .select(
      "id, amount, currency, status, reference, failure_reason, requested_at, processed_at, payout_account:payout_account_id(account_type, account_holder_name, provider, account_number)",
    )
    .eq("id", payoutId)
    .eq("organizer_id", actor.accountId)
    .maybeSingle();

  if (error) {
    logger.error(`Failed fetching payout detail: ${error.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  if (!data) {
    return { status: 404, message: tr("payoutNotFound") };
  }

  return {
    status: 200,
    data: data as unknown as OrganizerPayoutDetail,
  };
});
