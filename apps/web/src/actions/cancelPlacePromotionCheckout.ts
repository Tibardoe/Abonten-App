"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { cancelPromotionCheckout } from "@abonten/services/checkout/checkoutCancellation";
import { tr } from "@abonten/services/i18n/requestLocale";

export default withActionLocale(async function cancelPlacePromotionCheckout(
  checkoutId: string,
) {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  return cancelPromotionCheckout(
    supabase,
    "place_promotion_checkout",
    "place_promotion_checkout_id",
    checkoutId,
    userData.user.id,
  );
});
