"use server";

import { createClient } from "@/config/supabase/server";

export async function getUserDetails() {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user.user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: userDetails, error: userDetailsError } = await supabase
    .from("user_info")
    .select("*")
    .eq("id", user.user.id)
    .single();

  if (userDetailsError) {
    return {
      status: 500,
      message: `Error fetching user details: ${userDetailsError.message}`,
    };
  }

  if (!userDetails) {
    return { status: 401, message: "User not found" };
  }

  return { status: 200, userDetails };
}
