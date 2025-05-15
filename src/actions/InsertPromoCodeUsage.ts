"use server";
import { createClient } from "@/config/supabase/server";

export default async function insertPromoCodeUsage(code: string) {
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

  const { error: insertError } = await supabase
    .from("promo_code_usage")
    .insert({
      promo_code_id: promoCode.id,
      user_id: user.id,
      event_id: promoCode.event.id,
    });

  if (insertError) {
    console.log(insertError.message);

    return { status: 500, message: "Failed to insert promo code" };
  }

  const { error: updateError } = await supabase
    .from("promo_code")
    .update({ times_used: promoCode.times_used + 1 })
    .eq("id", promoCode.id);

  if (updateError) {
    console.log(
      `Failed to update promo code usage count:${updateError.message}`,
    );

    return { status: 500, message: "Failed to update promo code usage count" };
  }

  return { status: 200, discountPercentage: promoCode.discount_percentage };
}
