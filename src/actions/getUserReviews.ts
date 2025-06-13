"use server";

import { createClient } from "@/config/supabase/server";

export async function getUserReviews(username: string) {
  const supabase = await createClient();

  // const { data: user, error: userError } = await supabase.auth.getUser();

  // if (userError) {
  //   return {
  //     status: 500,
  //     message: `Failed fetching user: ${userError.message}`,
  //   };
  // }

  // if (!user) {
  //   return { status: 401, message: "User not logged in" };
  // }

  const { data: user, error: userError } = await supabase
    .from("user_info")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (!user || userError) {
    console.log(`Error fetching user id: ${userError?.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  const { data, error } = await supabase
    .from("review")
    .select("*, user_info:reviewer_id(username)")
    .eq("reviewed_id", user.id);

  if (error) {
    console.log(`Failed fetching reviews: ${error.message}`);

    return {
      status: 500,
      message: "Something went wrong!",
    };
  }

  return { status: 200, data };
}
