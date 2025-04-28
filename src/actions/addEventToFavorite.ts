"use server";

import { createClient } from "@/config/supabase/server";

export async function addEventToFavorite(eventId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
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
