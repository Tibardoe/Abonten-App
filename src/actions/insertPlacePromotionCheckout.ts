"use server";

import { createClient } from "@/config/supabase/server";
import { getCheckoutExpiryTimestamp } from "@/utils/checkoutExpiry";
import { logger } from "@/utils/logger";

/**
 * Reserve step for a Featured Places purchase — the place equivalent of
 * insertEventPromotionCheckout.ts. Never trusts a client-supplied price: the
 * unit/total price always comes from the already-seeded place_promotion_tier
 * row, never from the request.
 */
export default async function insertPlacePromotionCheckout(
  placeId: string,
  tierId: number,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message} `,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: place, error: placeError } = await supabase
    .from("place")
    .select("id, owner_id")
    .eq("id", placeId)
    .maybeSingle();

  if (placeError || !place) {
    return { status: 404, message: "Place not found" };
  }

  if (place.owner_id !== user.id) {
    return { status: 403, message: "Not authorized to promote this place" };
  }

  const { data: tier, error: tierError } = await supabase
    .from("place_promotion_tier")
    .select("*")
    .eq("id", tierId)
    .eq("is_active", true)
    .maybeSingle();

  if (tierError || !tier) {
    return { status: 404, message: "Promotion tier not found" };
  }

  const { data: checkout, error: insertError } = await supabase
    .from("place_promotion_checkout")
    .insert({
      place_id: placeId,
      owner_id: user.id,
      tier_id: tier.id,
      unit_price: tier.price,
      total_price: tier.price,
      currency: tier.currency,
      status: "pending",
      expires_at: getCheckoutExpiryTimestamp(),
    })
    .select("id")
    .single();

  if (insertError) {
    logger.error(
      `Error inserting place promotion checkout: ${insertError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  if (!checkout) {
    return { status: 404, message: "No promotion checkout data found!" };
  }

  return { status: 200, data: checkout };
}
