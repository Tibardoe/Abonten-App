"use server";

import { createClient } from "@/config/supabase/server";

export async function reorderPlacePhotos(placeId: string, photoIds: string[]) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: place, error: fetchError } = await supabase
    .from("place")
    .select("id")
    .eq("id", placeId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (fetchError || !place) {
    return { status: 404, message: "Place not found or unauthorized" };
  }

  const results = await Promise.all(
    photoIds.map((photoId, index) =>
      supabase
        .from("place_photo")
        .update({ position: index })
        .eq("id", photoId)
        .eq("place_id", placeId),
    ),
  );

  const failed = results.find((result) => result.error);

  if (failed?.error) {
    return {
      status: 500,
      message: `Error reordering photos: ${failed.error.message}`,
    };
  }

  return { status: 200, message: "Photos reordered successfully!" };
}
