"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";

export const removePlaceFromFavorite = withActionLocale(
  async function removePlaceFromFavorite(placeId: string) {
    const supabase = await createClient();

    const { data: user, error: userError } = await supabase.auth.getUser();

    if (!user || userError) {
      return { status: 401, message: tr("userNotLoggedIn2") };
    }

    const { error: deleteError } = await supabase
      .from("favorite_place")
      .delete()
      .eq("place_id", placeId)
      .eq("user_id", user.user.id);

    if (deleteError) {
      return { status: 500, message: tr("failedToRemoveFavorite") };
    }

    return { status: 200, message: tr("placeRemovedFromFavorites") };
  },
);
