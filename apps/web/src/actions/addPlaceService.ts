"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type PlaceServiceCoreResult,
  addPlaceServiceCore,
} from "@abonten/services/places/placeServiceCore";

type AddPlaceServiceInput = {
  placeId: string;
  name: string;
  description?: string;
  price?: number;
  priceUnit?: string;
  showPrice: boolean;
};

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/places/:placeId/services route).
export const addPlaceService = withActionLocale(async function addPlaceService(
  input: AddPlaceServiceInput,
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

  return addPlaceServiceCore(supabase, user.id, input);
});
