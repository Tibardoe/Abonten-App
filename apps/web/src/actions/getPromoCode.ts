"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type GetPromoCodeCoreResult,
  getPromoCodeCore,
} from "@abonten/services/promo-codes/getPromoCodeCore";

export default withActionLocale(async function getPromoCode(
  code: string,
  eventId: string,
): Promise<GetPromoCodeCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  return getPromoCodeCore(supabase, user.id, code, eventId);
});
