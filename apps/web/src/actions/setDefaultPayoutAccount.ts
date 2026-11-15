"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type MutatePayoutAccountResult,
  setDefaultPayoutAccountCore,
} from "@abonten/services/organizer/payoutAccountCore";
import { signedInAt } from "@abonten/services/teams/teamMoney";

/**
 * Marks one payout account as the organizer's default, unsetting any
 * previous default first — same two-step approach as
 * setDefaultPaymentMethod.ts, safe under the payout_account_one_default_per_organizer
 * partial unique index.
 */
export default withActionLocale(async function setDefaultPayoutAccount(
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

  const result = await setDefaultPayoutAccountCore(
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
