"use server";

import { createClient } from "@/config/supabase/server";

export async function removeEventFromFavorite(eventId: string) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { error: deleteError } = await supabase
    .from("favorite")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", user.user.id); // make sure you delete the correct favorite

  if (deleteError) {
    return { status: 500, message: "Failed to remove favorite" };
  }

  return { status: 200, message: "Event removed from favorites" };
}
