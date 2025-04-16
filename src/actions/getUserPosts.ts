"use server";

import { createClient } from "@/config/supabase/server";

export async function getUserPosts(username: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("event")
    .select("*, user_info:event_organizer_id_fkey(username)")
    .eq("user_info.username", username);

  if (error) {
    return { status: 500, message: `Failed fetching events: ${error.message}` };
  }

  return { status: 200, data };
}
