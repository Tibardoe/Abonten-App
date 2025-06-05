"use server";

import { createClient } from "@/config/supabase/server";

export default async function deleteUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    console.log(`Error fetching user: ${userError?.message}`);

    return { status: 401, message: "User not Logged in" };
  }

  const { error: deleteUserError } = await supabase.auth.admin.deleteUser(
    user.id,
  );

  if (deleteUserError) {
    console.log(`Error deleting user: ${deleteUserError.message}`);

    return { status: 500, message: "Something went wrong! Try again" };
  }

  return { status: 200, message: "User deleted successfully!" };
}
