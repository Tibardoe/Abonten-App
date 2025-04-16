"use server";

import { createClient } from "@/config/supabase/server";

export async function getUserReviews(username: string) {
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
    .from("review")
    .select("*, user_info!inner(*)")
    .eq("user_info.username", username);

  if (error) {
    return {
      status: 500,
      message: `Failed fetching reviews: ${error.message}`,
    };
  }

  return { status: 200, data };
}
