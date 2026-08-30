"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

// Mirrors getPlacePromotionCheckout.ts exactly -- same self-heal-then-read
// shape, just scoped by event_promotion_checkout's owner_id column and
// joined against `event` instead of `place`.
export default async function getEventPromotionCheckout(checkoutId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  // Self-heal: reclaim this checkout if its reservation window has passed,
  // so a page load always reflects an accurate status instead of a stale
  // 'pending'.
  await supabase.rpc("expire_stale_event_promotion_checkouts");

  const { data: checkoutData, error: checkoutDataError } = await supabase
    .from("event_promotion_checkout")
    .select("*, event_promotion_tier(*), event(title)")
    .eq("id", checkoutId)
    .eq("owner_id", user.id);

  if (checkoutDataError) {
    logger.error(`Failed fetching checkout data: ${checkoutDataError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: checkoutData };
}
