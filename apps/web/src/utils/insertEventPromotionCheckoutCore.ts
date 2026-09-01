import { getCheckoutExpiryTimestamp } from "@abonten/core/checkoutExpiry";
import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of insertEventPromotionCheckout, lifted so the mobile
// POST /api/mobile/organizer/events/:id/promote route runs the exact same
// reserve step as the web action. Never trusts a client-supplied price —
// the unit/total price always comes from the seeded event_promotion_tier
// row. Deliberately NOT a "use server" file.

export type InsertEventPromotionCheckoutResult =
  | { status: 403 | 404 | 500; message: string }
  | {
      status: 200;
      checkoutId: string;
      tierLabel: string;
      amount: number;
      currency: string;
    };

export async function insertEventPromotionCheckoutCore(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  tierId: number,
): Promise<InsertEventPromotionCheckoutResult> {
  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id, organizer_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    return { status: 404, message: "Event not found" };
  }

  if (event.organizer_id !== userId) {
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
      owner_id: userId,
      tier_id: tier.id,
      unit_price: tier.price,
      total_price: tier.price,
      currency: tier.currency,
      status: "pending",
      expires_at: getCheckoutExpiryTimestamp(),
    })
    .select("id")
    .single();

  if (insertError || !checkout) {
    logger.error(
      `Error inserting event promotion checkout: ${insertError?.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  return {
    status: 200,
    checkoutId: checkout.id as string,
    tierLabel: tier.duration_label as string,
    amount: tier.price as number,
    currency: tier.currency as string,
  };
}
