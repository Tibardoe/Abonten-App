"use server";

import { createClient } from "@/config/supabase/server";

export async function addPlaceToFavorite(placeId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { error: insertError } = await supabase.from("favorite_place").insert({
    user_id: user.id,
    place_id: placeId,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    throw insertError;
  }

  return { status: 200, message: "Place added to favorites!" };
}
