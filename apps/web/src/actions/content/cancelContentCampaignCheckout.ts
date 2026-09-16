"use server";

import { createClient } from "@/config/supabase/server";
import { cancelPromotionCheckout } from "@abonten/services/checkout/checkoutCancellation";

/** Cancels a pending, unpaid campaign checkout (the campaign goes back to draft on the next sweep). */
export async function cancelContentCampaignCheckout(checkoutId: string) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { status: 401, message: "User not logged in" };
  }
  return cancelPromotionCheckout(
    supabase,
    "content_campaign_checkout",
    "content_campaign_checkout_id",
    checkoutId,
    userData.user.id,
  );
}
