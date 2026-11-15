"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type AddPayoutAccountResult,
  addPayoutAccountCore,
} from "@abonten/services/organizer/payoutAccountCore";
import { signedInAt } from "@abonten/services/teams/teamMoney";
import type { AddPayoutAccountInput } from "@abonten/validation/payoutAccountSchema";

/**
 * Saves a new organizer payout destination. The first account an organizer
 * adds is automatically their default, matching addPaymentMethod.ts's exact
 * precedent for the equivalent buyer-side flow.
 */
export default withActionLocale(async function addPayoutAccount(
  input: AddPayoutAccountInput,
): Promise<AddPayoutAccountResult> {
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

  const result = await addPayoutAccountCore(
    supabase,
    actor.accountId,
    input,
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
