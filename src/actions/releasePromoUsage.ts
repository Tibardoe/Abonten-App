"use server";

import { createClient } from "@/config/supabase/server";

/**
 * Compensating action for claimPromoUsage: gives back a redemption that was
 * claimed for a checkout that ultimately failed, expired, or was cancelled
 * before payment — same role releaseTicketQuantity plays for inventory.
 */
export default async function releasePromoUsage(
  promoCodeId: string,
  userId: string,
  eventId: string,
  unitsToRelease: number,
) {
  if (unitsToRelease <= 0) return;

  const supabase = await createClient();

  await supabase
    .from("promo_code_usage")
    .delete()
    .eq("promo_code_id", promoCodeId)
    .eq("user_id", userId)
    .eq("event_id", eventId);

  const { data: promoCode, error: promoCodeError } = await supabase
    .from("promo_code")
    .select("times_used")
    .eq("id", promoCodeId)
    .maybeSingle();

  if (promoCodeError || !promoCode) return;

  await supabase
    .from("promo_code")
    .update({ times_used: Math.max(0, promoCode.times_used - unitsToRelease) })
    .eq("id", promoCodeId);
}
