"use server";

import { createClient } from "@/config/supabase/server";
import { getCheckoutExpiryTimestamp } from "@/utils/checkoutExpiry";

/**
 * Reserve step for an Event Promotion purchase — mirrors
 * insertPlacePromotionCheckout.ts exactly. Never trusts a client-supplied
 * price: the unit/total price always comes from the already-seeded
 * event_promotion_tier row, never from the request.
 */
export default async function insertEventPromotionCheckout(
  eventId: string,
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

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id, organizer_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    return { status: 404, message: "Event not found" };
  }

  if (event.organizer_id !== user.id) {
    return { status: 403, message: "Not authorized to promote this event" };
  }

  const { data: tier, error: tierError } = await supabase
    .from("event_promotion_tier")
    .select("*")
    .eq("id", tierId)
    .eq("is_active", true)
    .maybeSingle();

  if (tierError || !tier) {
    return { status: 404, message: "Promotion tier not found" };
  }

  const { data: checkout, error: insertError } = await supabase
    .from("event_promotion_checkout")
    .insert({
      event_id: eventId,
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
    console.log(
      `Error inserting event promotion checkout: ${insertError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  if (!checkout) {
    return { status: 404, message: "No promotion checkout data found!" };
  }

  return { status: 200, data: checkout };
}
