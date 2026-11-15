"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type MutatePayoutAccountResult,
  removePayoutAccountCore,
} from "@abonten/services/organizer/payoutAccountCore";
import { signedInAt } from "@abonten/services/teams/teamMoney";

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
export default withActionLocale(async function removePayoutAccount(
  payoutAccountId: string,
): Promise<MutatePayoutAccountResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await actingFor(user.id, "payout.manage");
  if (actor.error) return actor.error;

  const result = await removePayoutAccountCore(
    supabase,
    actor.accountId,
    payoutAccountId,
    actor.role
      ? {
          personId: user.id,
          accountId: actor.accountId,
          role: actor.role,
          signedInAt: await signedInAt(supabase),
        }
      : null,
  );

  if (result.status === 200) {
    revalidateAppPath("/finances/payout-accounts");
  }

  return result;
});
