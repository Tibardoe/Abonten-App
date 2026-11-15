"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type DeletePromoCodeCoreResult,
  deletePromoCodeCore,
} from "@abonten/services/promo-codes/eventPromoCodeManageCore";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/promo-codes/delete route). A code that
// has already been redeemed is deactivated, not deleted, so usage history
// survives.
export const deletePromoCode = withActionLocale(async function deletePromoCode(
  promoCodeId: string,
): Promise<DeletePromoCodeCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  // Managing as a team: the chosen team, if the person's role covers this.

  const actor = await actingFor(user.id, "promo.manage");

  if (actor.error) return actor.error;

  return deletePromoCodeCore(supabase, actor.accountId, promoCodeId);
});
