"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

// Mirrors getEventPromotionCheckout.ts exactly -- same self-heal-then-read
// shape, just scoped by place_promotion_checkout's owner_id column instead
// of event_promotion_checkout's owner_id.
export default async function getPlacePromotionCheckout(checkoutId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  // Self-heal: reclaim this checkout if its reservation window has passed,
  // the same way getEventPromotionCheckout does for event promotion
  // checkouts, so a page load always reflects an accurate status instead of
  // a stale 'pending'.
  await supabase.rpc("expire_stale_place_promotion_checkouts");

  const { data: checkoutData, error: checkoutDataError } = await supabase
    .from("place_promotion_checkout")
    .select("*, place_promotion_tier(*), place(name, slug)")
    .eq("id", checkoutId)
    .eq("owner_id", user.id);

  if (checkoutDataError) {
    logger.error(`Failed fetching checkout data: ${checkoutDataError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: checkoutData };
}
