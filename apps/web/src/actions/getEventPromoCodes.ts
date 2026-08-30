"use server";

import { createClient } from "@/config/supabase/server";

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

export async function getEventPromoCodes(eventId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return {
      status: 401,
      message: "User not logged in",
      data: [] as EventPromoCode[],
    };
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .maybeSingle();

  if (eventError) {
    return {
      status: 500,
      message: eventError.message,
      data: [] as EventPromoCode[],
    };
  }

  if (!event) {
    return {
      status: 403,
      message: "Not authorized to view this event's promo codes",
      data: [] as EventPromoCode[],
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
    return {
      status: 500,
      message: promoCodesError.message,
      data: [] as EventPromoCode[],
    };
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
  }));

  return { status: 200, message: "OK", data };
}
