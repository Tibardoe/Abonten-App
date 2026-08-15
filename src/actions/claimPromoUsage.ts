"use server";
import { createClient } from "@/config/supabase/server";

/**
 * Atomically claims `unitsToClaim` redemptions of a promo code for one
 * user/event, mirroring the compare-and-swap pattern in
 * reserveTicketQuantity: the times_used increment is guarded by
 * `.eq("times_used", <value just read>)`, so two concurrent checkouts
 * racing for the last remaining redemption can never both succeed.
 * The per-user promo_code_usage row (PK: promo_code_id, user_id, event_id)
 * additionally prevents the same user claiming twice.
 */
export default async function claimPromoUsage(
  promoCodeId: string,
  userId: string,
  eventId: string,
  unitsToClaim: number,
) {
  const supabase = await createClient();

  const { data: promoCode, error: promoCodeError } = await supabase
    .from("promo_code")
    .select("times_used, max_uses")
    .eq("id", promoCodeId)
    .maybeSingle();

  if (promoCodeError || !promoCode) {
    return { status: 404, message: "Promo code no longer exists" };
  }

  if (
    promoCode.max_uses !== null &&
    promoCode.times_used + unitsToClaim > promoCode.max_uses
  ) {
    return {
      status: 409,
      message: "Promo code has reached its usage limit!",
    };
  }

  const { error: usageInsertError } = await supabase
    .from("promo_code_usage")
    .insert({ promo_code_id: promoCodeId, user_id: userId, event_id: eventId });

  if (usageInsertError) {
    // Most likely the per-user PK already exists (already used this promo).
    return { status: 400, message: "You have already used this promo code" };
  }

  const { data: updated, error: updateError } = await supabase
    .from("promo_code")
    .update({ times_used: promoCode.times_used + unitsToClaim })
    .eq("id", promoCodeId)
    .eq("times_used", promoCode.times_used)
    .select("id");

  if (updateError || !updated || updated.length === 0) {
    // Lost the race for the last slot(s) — undo the usage row we just
    // inserted so this user isn't locked out of retrying.
    await supabase
      .from("promo_code_usage")
      .delete()
      .eq("promo_code_id", promoCodeId)
      .eq("user_id", userId)
      .eq("event_id", eventId);

    return {
      status: 409,
      message:
        "This promo code was just claimed by someone else. Please try again.",
    };
  }

  return { status: 200 };
}
