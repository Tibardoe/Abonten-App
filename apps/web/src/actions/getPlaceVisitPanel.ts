"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getPlaceVisitPanelCore } from "@abonten/services/places/placeVisitCore";
import type { PlaceVisitPanel } from "@abonten/types/rewards";

/**
 * The owner's check-in panel for a place: the QR code right now (it changes
 * every 30 seconds) and the visit figures. Same service as
 * GET /api/mobile/organizer/places/[placeId]/visit-code.
 */
export const getPlaceVisitPanel = withActionLocale(
  async function getPlaceVisitPanel(placeId: string): Promise<{
    status: number;
    message?: string;
    data?: PlaceVisitPanel;
  }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("userNotLoggedIn") };
    if (typeof placeId !== "string") {
      return { status: 400, message: tr("placeIsRequired") };
    }

    return getPlaceVisitPanelCore(
      supabase,
      user.id,
      placeId,
      process.env.NEXT_PUBLIC_BASE_URL || undefined,
    );
  },
);
