"use server";

import { createClient } from "@/config/supabase/server";

export async function removePlaceFromFavorite(placeId: string) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not Logged in" };
  }

  const { error: deleteError } = await supabase
    .from("favorite_place")
    .delete()
    .eq("place_id", placeId)
    .eq("user_id", user.user.id);

  if (deleteError) {
    return { status: 500, message: "Failed to remove favorite" };
  }

  return { status: 200, message: "Place removed from favorites" };
}
