"use server";

import { createClient } from "@/config/supabase/server";

export default async function getPromoCode(code: string, eventId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  // Promo codes are unique per (event_id, normalized code), not globally,
  // so the lookup must be scoped by event_id and normalized the same way
  // codes are stored (upper/trim) -- otherwise the same code reused on a
  // different event would make maybeSingle() throw on multiple rows, and
  // a differently-cased code (e.g. "summer20" vs "SUMMER20") would
  // incorrectly miss.
  const { data: promoCode, error: promoCodeError } = await supabase
    .from("promo_code")
    .select("*")
    .eq("event_id", eventId)
    .eq("promo_code", code.trim().toUpperCase())
    .maybeSingle();

  if (promoCodeError) {
    console.log(`Error fetching promo code: ${promoCodeError.message}`);

    return {
      status: 500,
      message: `Error fetching promo code: ${promoCodeError.message}`,
    };
  }

  if (!promoCode) {
    return { status: 404, message: "Promo code is invalid!" };
  }

  if (promoCode.is_active === false) {
    return { status: 401, message: "Promo code is no longer active!" };
  }

  if (promoCode.expires_at && new Date(promoCode.expires_at) < new Date()) {
    return { status: 401, message: "Promo code has expired!" };
  }

  const { data: promoCodeUsage, error: promoCodeUsageError } = await supabase
    .from("promo_code_usage")
    .select("promo_code_id")
    .eq("promo_code_id", promoCode.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (promoCodeUsageError) {
    console.log(promoCodeUsageError.message);

    return {
      status: 500,
      message: `Error fetching promo code usage: ${promoCodeUsageError.message}`,
    };
  }

  if (promoCodeUsage) {
    return { status: 400, message: "You have already used this promo code" };
  }

  // max_uses is nullable and means "unlimited" — remainingUses stays null in that case
  // so callers never treat an unlimited code as exhausted.
  const remainingUses =
    promoCode.max_uses === null
      ? null
      : Math.max(0, promoCode.max_uses - promoCode.times_used);

  if (remainingUses !== null && remainingUses <= 0) {
    return { status: 401, message: "Promo code has reached its usage limit!" };
  }

  return {
    status: 200,
    id: promoCode.id,
    discountPercentage: promoCode.discount_percentage,
    remainingUses,
  };
}
