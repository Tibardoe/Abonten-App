"use server";

import { createClient } from "@/config/supabase/server";

export async function getUserProfileDetails(username: string) {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("user_profile_details")
      .select("*")
      .eq("username", username)
      .single();

    const { data: authData } = await supabase.auth.getUser();

    let ownUsername = null;

    if (authData?.user) {
      const { data: ownInfo } = await supabase
        .from("user_info")
        .select("username")
        .eq("id", authData.user.id)
        .single();
      ownUsername = ownInfo?.username;
    }

    if (error || !data) {
      return {
        status: 404,
        message: "User profile not found",
        error: error?.message,
      };
    }

    return { status: 200, data, ownUsername };
  } catch (error) {
    console.error("Error fetching user profile", error);
    return { status: 500, message: "Internal server error" };
  }
}
