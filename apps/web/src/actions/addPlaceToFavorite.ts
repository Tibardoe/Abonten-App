"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";

export const addPlaceToFavorite = withActionLocale(
  async function addPlaceToFavorite(placeId: string) {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      return { status: 401, message: tr("userNotLoggedIn") };
    }

    const { error: insertError } = await supabase
      .from("favorite_place")
      .insert({
        user_id: user.id,
        place_id: placeId,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      throw insertError;
    }

    return { status: 200, message: tr("placeAddedToFavorites") };
  },
);
