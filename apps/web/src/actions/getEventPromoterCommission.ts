"use server";

import { createClient } from "@/config/supabase/server";
import { getEventPromoterCommissionCore } from "@abonten/services/rewards/promoterCommissionCore";
import type { EventPromoterCommission } from "@abonten/types/rewards";

/**
 * The commission the organizer offers promoters on one of their events, and
 * how promoters' sales are going. Same service as
 * GET /api/mobile/organizer/events/[eventId]/promoter-commission.
 */
export async function getEventPromoterCommission(eventId: string): Promise<{
  status: number;
  message?: string;
  data?: EventPromoterCommission;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not logged in" };
  if (typeof eventId !== "string") {
    return { status: 400, message: "Event is required." };
  }

  return getEventPromoterCommissionCore(supabase, user.id, eventId);
}
