"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type ListPayoutAccountsResult,
  listPayoutAccountsCore,
} from "@abonten/services/organizer/payoutAccountCore";

/**
 * Every active payout destination for the current organizer — separate
 * from getUserPaymentMethods (buyer payment methods) and from the per-event
 * receiving_account rows, per this feature's explicit "don't mix the two
 * concepts" requirement.
 */
export default withActionLocale(
  async function getOrganizerPayoutAccounts(): Promise<ListPayoutAccountsResult> {
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

    return listPayoutAccountsCore(supabase, actor.accountId);
  },
);
