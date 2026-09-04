import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth bodies of getEventPromoCodes / updatePromoCode / deletePromoCode,
// lifted so the mobile organizer promo-code routes run the exact same logic
// as the web Server Actions — no fork. `promo_code` has no organizer_id of
// its own, so ownership is always proved by joining to its `event`.
// Deliberately NOT a "use server" file.

export type EventPromoCode = {
  id: string;
  promoCode: string;
  discountPercentage: number | null;
  maxUses: number | null;
  timesUsed: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
};

export type EventPromoCodesCoreResult =
  | { status: 403 | 500; message: string; data: EventPromoCode[] }
  | { status: 200; message: string; data: EventPromoCode[] };

export async function fetchEventPromoCodes(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<EventPromoCodesCoreResult> {
  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (eventError) {
    return { status: 500, message: eventError.message, data: [] };
  }

  if (!event) {
    return {
      status: 403,
      message: "Not authorized to view this event's promo codes",
      data: [],
    };
  }

  const { data: promoCodes, error: promoCodesError } = await supabase
    .from("promo_code")
    .select(
      "id, promo_code, discount_percentage, max_uses, times_used, expires_at, is_active, created_at",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (promoCodesError) {
    return { status: 500, message: promoCodesError.message, data: [] };
  }

  const data: EventPromoCode[] = (promoCodes ?? []).map((p) => ({
    id: p.id,
    promoCode: p.promo_code,
    discountPercentage: p.discount_percentage,
    maxUses: p.max_uses,
    timesUsed: p.times_used,
    expiresAt: p.expires_at,
    isActive: p.is_active,
    createdAt: p.created_at,
  })) as unknown as EventPromoCode[];

  return { status: 200, message: "OK", data };
}

export type UpdatePromoCodeCoreInput = {
  promoCodeId: string;
  discountPercentage: number;
  maxUses: number | null;
  expiresAt: Date | string;
  isActive: boolean;
};

export type UpdatePromoCodeCoreResult = {
  status: 200 | 403 | 404 | 500;
  message: string;
};

// Deliberately does not touch the promo_code text itself or event_id — keeps
// this scoped to the terms of an existing code (discount, cap, expiry,
// active flag), not renaming/re-scoping it.
export async function updatePromoCodeCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: UpdatePromoCodeCoreInput,
): Promise<UpdatePromoCodeCoreResult> {
  const { data: promoCode, error: fetchError } = await supabase
    .from("promo_code")
    .select("id, event_id")
    .eq("id", input.promoCodeId)
    .maybeSingle();

  if (fetchError) {
    return { status: 500, message: fetchError.message };
  }

  if (!promoCode || promoCode.event_id === null) {
    return { status: 404, message: "Promo code not found" };
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", promoCode.event_id)
    .eq("organizer_id", userId)
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
      expires_at:
        input.expiresAt instanceof Date
          ? input.expiresAt.toISOString()
          : input.expiresAt,
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

export type DeletePromoCodeCoreResult = {
  status: 200 | 403 | 404 | 500;
  message: string;
  deactivatedOnly?: boolean;
};

export async function deletePromoCodeCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  promoCodeId: string,
): Promise<DeletePromoCodeCoreResult> {
  const { data: promoCode, error: fetchError } = await supabase
    .from("promo_code")
    .select("id, event_id, times_used")
    .eq("id", promoCodeId)
    .maybeSingle();

  if (fetchError) {
    return { status: 500, message: fetchError.message };
  }

  if (!promoCode || promoCode.event_id === null) {
    return { status: 404, message: "Promo code not found" };
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", promoCode.event_id)
    .eq("organizer_id", userId)
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
  if ((promoCode.times_used ?? 0) > 0) {
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
