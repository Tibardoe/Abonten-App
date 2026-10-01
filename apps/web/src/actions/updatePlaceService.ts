"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type PlaceServiceCoreResult,
  updatePlaceServiceCore,
} from "@abonten/services/places/placeServiceCore";

type UpdatePlaceServiceInput = {
  serviceId: string;
  name?: string;
  description?: string | null;
  price?: number | null;
  priceUnit?: string | null;
  showPrice?: boolean;
};

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile PATCH /api/mobile/organizer/places/services/:serviceId route).
export const updatePlaceService = withActionLocale(
  async function updatePlaceService(
    input: UpdatePlaceServiceInput,
  ): Promise<PlaceServiceCoreResult | { status: 401; message: string }> {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        status: 401 as const,
        message: tr("userNotAuthenticated"),
      };
    }

    return updatePlaceServiceCore(supabase, user.id, input);
  },
);
