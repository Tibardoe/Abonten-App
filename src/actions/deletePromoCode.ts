"use server";

import { createClient } from "@/config/supabase/server";

export async function deletePromoCode(promoCodeId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: promoCode, error: fetchError } = await supabase
    .from("promo_code")
    .select("id, event_id, times_used")
    .eq("id", promoCodeId)
    .maybeSingle();

  if (fetchError) {
    return { status: 500, message: fetchError.message };
  }

  if (!promoCode) {
    return { status: 404, message: "Promo code not found" };
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", promoCode.event_id)
    .eq("organizer_id", user.id)
    .maybeSingle();

  if (eventError) {
    return { status: 500, message: eventError.message };
  }

  if (!event) {
    return { status: 403, message: "Not authorized to delete this promo code" };
  }

  // promo_code_usage rows reference this code with ON DELETE CASCADE, so a
  // hard delete on a code that's already been redeemed would silently wipe
  // real usage/discount history. Deactivate instead once it's been used at
  // least once — the code stops working at checkout (getPromoCode.ts checks
  // is_active) but the redemption history that already happened stays
  // intact. Only a never-used code is actually removed.
  if (promoCode.times_used > 0) {
    const { error: deactivateError } = await supabase
      .from("promo_code")
      .update({ is_active: false })
      .eq("id", promoCodeId);

    if (deactivateError) {
      return {
        status: 500,
        message: `Failed to deactivate promo code: ${deactivateError.message}`,
      };
    }

    return {
      status: 200,
      message:
        "This promo code has already been used, so it was deactivated instead of deleted.",
      deactivatedOnly: true,
    };
  }

  const { error: deleteError } = await supabase
    .from("promo_code")
    .delete()
    .eq("id", promoCodeId);

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to delete promo code: ${deleteError.message}`,
    };
  }

  return {
    status: 200,
    message: "Promo code deleted successfully",
    deactivatedOnly: false,
  };
}
