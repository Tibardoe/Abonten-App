"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type RecordPlaceVisitInput,
  recordPlaceVisitCore,
} from "@abonten/services/places/placeVisitCore";
import { DEVICE_COOKIE_NAME } from "@abonten/services/rewards/referralCookie";
import type { PlaceVisitResult } from "@abonten/types/rewards";
import { cookies } from "next/headers";

/**
 * Checks the signed-in user in at a place with the code its owner shows
 * (the place page opened from the QR code, `?visit=CODE`). The browser's
 * location is only a claim; the server checks it against the place. Same
 * service as POST /api/mobile/places/visits.
 */
export const recordPlaceVisit = withActionLocale(
  async function recordPlaceVisit(
    input: Pick<
      RecordPlaceVisitInput,
      "placeId" | "code" | "lat" | "lng" | "accuracyM"
    >,
  ): Promise<{ status: number; message?: string; data?: PlaceVisitResult }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("signInToCheckIn") };
    if (typeof input?.placeId !== "string" || typeof input.code !== "string") {
      return { status: 400, message: tr("invalidRequest2") };
    }

    const cookieStore = await cookies();
    return recordPlaceVisitCore(user.id, {
      placeId: input.placeId,
      code: input.code,
      lat: typeof input.lat === "number" ? input.lat : null,
      lng: typeof input.lng === "number" ? input.lng : null,
      accuracyM: typeof input.accuracyM === "number" ? input.accuracyM : null,
      platform: "web",
      installId: cookieStore.get(DEVICE_COOKIE_NAME)?.value ?? null,
    });
  },
);
