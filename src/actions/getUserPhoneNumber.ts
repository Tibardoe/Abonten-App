"use server";

import { createClient } from "@/config/supabase/server";

export default async function getUserPhoneNumber() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    console.log(`Error fetching user: ${userError?.message}`);

    return { status: 401, message: "User not Logged in" };
  }

  return {
    status: 200,
    phoneAndEmail: { phone: user.phone, email: user.email },
  };
}
