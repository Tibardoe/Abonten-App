"use server";

import { createClient } from "@/config/supabase/server";

export async function getUserPosts() {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Failed fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data, error } = await supabase
    .from("event")
    .select("*")
    .eq("organizer_id", user.user.id);

  if (error) {
    return { status: 500, message: `Failed fetching events: ${error.message}` };
  }

  return { status: 200, data };
}
