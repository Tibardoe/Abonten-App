"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type UpdatePromoCodeCoreResult,
  updatePromoCodeCore,
} from "@abonten/services/promo-codes/eventPromoCodeManageCore";

type UpdatePromoCodeInput = {
  promoCodeId: string;
  discountPercentage: number;
  maxUses: number | null;
  expiresAt: Date;
  isActive: boolean;
};

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/promo-codes/update route). Only the
// terms of an existing code change here — never its text or event_id.
export const updatePromoCode = withActionLocale(async function updatePromoCode(
  input: UpdatePromoCodeInput,
): Promise<UpdatePromoCodeCoreResult | { status: 401; message: string }> {
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

  return updatePromoCodeCore(supabase, actor.accountId, input);
});
