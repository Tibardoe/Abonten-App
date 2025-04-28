"use server";

import { createClient } from "@/config/supabase/server";

export async function deleteEvent(eventId: string) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not Logged in" };
  }

  const { error: deleteError } = await supabase
    .from("event")
    .delete()
    .eq("id", eventId)
    .eq("organizer_id", user.user.id); // make sure you delete the correct favorite

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to delete event: ${deleteError.message}`,
    };
  }

  return { status: 200, message: "Event deleted successfully" };
}
