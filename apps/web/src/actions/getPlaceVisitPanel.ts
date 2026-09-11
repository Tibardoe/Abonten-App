"use server";

import { createClient } from "@/config/supabase/server";
import { getPlaceVisitPanelCore } from "@abonten/services/places/placeVisitCore";
import type { PlaceVisitPanel } from "@abonten/types/rewards";

/**
 * The owner's check-in panel for a place: the QR code right now (it changes
 * every 30 seconds) and the visit figures. Same service as
 * GET /api/mobile/organizer/places/[placeId]/visit-code.
 */
export async function getPlaceVisitPanel(placeId: string): Promise<{
  status: number;
  message?: string;
  data?: PlaceVisitPanel;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not logged in" };
  if (typeof placeId !== "string") {
    return { status: 400, message: "Place is required." };
  }

  return getPlaceVisitPanelCore(
    supabase,
    user.id,
    placeId,
    process.env.NEXT_PUBLIC_BASE_URL || undefined,
  );
}
