"use server";

import { createClient } from "@/config/supabase/server";

type UpdatePromoCodeInput = {
  promoCodeId: string;
  discountPercentage: number;
  maxUses: number | null;
  expiresAt: Date;
  isActive: boolean;
};

// Deliberately does not touch the promo_code text itself or event_id —
// keeps this scoped to the terms of an existing code (discount, cap,
// expiry, active flag), not renaming/re-scoping it. See updateEvent.ts for
// the parallel reasoning on why ticketing/promo fields aren't blind-
// overwritten from a form resubmit.
export async function updatePromoCode(input: UpdatePromoCodeInput) {
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
    .select("id, event_id")
    .eq("id", input.promoCodeId)
    .maybeSingle();

  if (fetchError) {
    return { status: 500, message: fetchError.message };
  }

  if (!promoCode) {
    return { status: 404, message: "Promo code not found" };
  }

  // promo_code has no organizer_id of its own — ownership is only provable
  // by checking the event it belongs to.
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
    return { status: 403, message: "Not authorized to edit this promo code" };
  }

  const { error: updateError } = await supabase
    .from("promo_code")
    .update({
      discount_percentage: input.discountPercentage,
      max_uses: input.maxUses,
      expires_at: input.expiresAt,
      is_active: input.isActive,
    })
    .eq("id", input.promoCodeId);

  if (updateError) {
    return {
      status: 500,
      message: `Failed to update promo code: ${updateError.message}`,
    };
  }

  return { status: 200, message: "Promo code updated successfully" };
}
