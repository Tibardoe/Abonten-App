"use server";

import { createClient } from "@/config/supabase/server";
import { cancelPromotionCheckout } from "@abonten/services/checkout/checkoutCancellation";

export default async function cancelEventPromotionCheckout(checkoutId: string) {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return { status: 401, message: "User not logged in" };
  }

  return cancelPromotionCheckout(
    supabase,
    "event_promotion_checkout",
    "event_promotion_checkout_id",
    checkoutId,
    userData.user.id,
  );
}
