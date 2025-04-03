"use server";

import { createClient } from "@/config/supabase/server";
import type { UserDetailsFormType } from "@/types/userProfileType";

export async function updateUserDetails(formData: UserDetailsFormType) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message} `,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { error } = await supabase
    .from("user_info")
    .update(formData)
    .eq("id", user.user.id);

  if (error) {
    return {
      status: 500,
      message: `Failed to update user details: :${error.message}`,
    };
  }

  return { status: 500, message: "User details updated successfully" };
}
