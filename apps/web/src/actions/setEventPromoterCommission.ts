"use server";

import { createClient } from "@/config/supabase/server";
import { setEventPromoterCommissionCore } from "@abonten/services/rewards/promoterCommissionCore";
import type { EventPromoterCommission } from "@abonten/types/rewards";

/**
 * Sets the promoter commission on one of the caller's events (basis points),
 * or stops it (null). Same service as
 * PUT /api/mobile/organizer/events/[eventId]/promoter-commission.
 */
export async function setEventPromoterCommission(input: {
  eventId: string;
  rateBps: number | null;
}): Promise<{
  status: number;
  message?: string;
  data?: EventPromoterCommission;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not logged in" };
  if (
    typeof input?.eventId !== "string" ||
    (input.rateBps !== null && typeof input.rateBps !== "number")
  ) {
    return { status: 400, message: "Invalid request" };
  }

  return setEventPromoterCommissionCore(supabase, user.id, input);
}
