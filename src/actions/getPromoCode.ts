"use server";

import { createClient } from "@/config/supabase/server";

export default async function getPromoCode(code: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: promoCode, error: promoCodeError } = await supabase
    .from("promo_code")
    .select("*, event:event_id(id)")
    .eq("promo_code", code)
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
    return { status: 401, message: "Promo code expired!" };
  }

  if (promoCode.times_used >= promoCode.max_uses) {
    return { status: 401, message: "Promo code exceeded maximum usage!" };
  }

  const { data: promoCodeUsage, error: promoCodeUsageError } = await supabase
    .from("promo_code_usage")
    .select("*, promo_code(*)")
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
    return { status: 400, message: "Promo code has already been used by user" };
  }

  return { status: 200, discountPercentage: promoCode.discount_percentage };
}
