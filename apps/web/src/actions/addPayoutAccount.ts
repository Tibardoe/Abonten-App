"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type AddPayoutAccountResult,
  addPayoutAccountCore,
} from "@abonten/services/organizer/payoutAccountCore";
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

  const result = await addPayoutAccountCore(supabase, user.id, input);

  if (result.status === 200) {
    revalidateAppPath("/finances/payout-accounts");
  }

  return result;
});
