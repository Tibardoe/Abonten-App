import { createClient } from "@/config/supabase/server";

export async function getUserProfileDetails() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { status: 401, message: "User not logged in" };
    }

    const userId = user.id;

    const { data, error } = await supabase
      .from("user_profile_detail")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return {
        status: 404,
        message: "User profile not found",
        error: error?.message,
      };
    }

    return { status: 200, data };
  } catch (error) {
    console.error("Error fetching user profile", error);
    return { status: 500, message: "Internal server error" };
  }
}
