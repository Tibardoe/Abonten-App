"use server";

import { createClient } from "@/config/supabase/server";
import { getEventPromoterOfferCore } from "@abonten/services/rewards/promoterCommissionCore";

/**
 * The commission a sharer earns on this event (null when there isn't one or
 * commissions aren't live for the caller) -- for the "share and earn" hint.
 */
export async function getEventPromoterOffer(
  eventId: string,
): Promise<{ status: number; data?: { rateBps: number } | null }> {
  if (typeof eventId !== "string") return { status: 400 };
  const supabase = await createClient();
  return getEventPromoterOfferCore(supabase, eventId);
}
