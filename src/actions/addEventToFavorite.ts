"use server";

import { createClient } from "@/config/supabase/server";

export async function addEventToFavorite(eventId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message} `,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: userFavorites, error } = await supabase
    .from("favorite")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", user.id) // Important: check for specific user's favorite
    .maybeSingle(); // maybeSingle avoids error if no row

  if (error) {
    return { status: 500, message: "Failed to fetch user favorites" };
  }

  if (userFavorites) {
    return { status: 400, message: "Event already added to favorites" };
  }

  const { error: insertError } = await supabase.from("favorite").insert({
    user_id: user.id,
    event_id: eventId,
    created_at: new Date(),
  });

  if (insertError) {
    throw insertError;
  }

  return { status: 200, message: "Event posted successfully!" };
}
