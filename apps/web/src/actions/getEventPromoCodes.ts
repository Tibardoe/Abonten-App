"use server";

import { createClient } from "@/config/supabase/server";
import {
  type EventPromoCode,
  type EventPromoCodesCoreResult,
  fetchEventPromoCodes,
} from "@/utils/eventPromoCodeManageCore";

export type { EventPromoCode } from "@/utils/eventPromoCodeManageCore";

// Thin wrapper: auth, then delegate to the shared body used by the mobile
// GET /api/mobile/organizer/events/:id/promo-codes route too — no fork.
export async function getEventPromoCodes(
  eventId: string,
): Promise<
  | EventPromoCodesCoreResult
  | { status: 401; message: string; data: EventPromoCode[] }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in", data: [] };
  }

  return fetchEventPromoCodes(supabase, user.id, eventId);
}
