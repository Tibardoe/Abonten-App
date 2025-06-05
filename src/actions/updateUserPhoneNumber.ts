"use server";

import { createClient } from "@/config/supabase/server";

export default async function updateUserPhoneNumber(phone: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    console.log(`Error fetching user: ${userError?.message}`);

    return { status: 401, message: "User not Logged in" };
  }

  const { error: updateUserPhoneNumberError } = await supabase.auth.updateUser({
    phone: phone,
  });

  if (updateUserPhoneNumberError) {
    console.log(
      `Error updating user phone number: ${updateUserPhoneNumberError.message}`,
    );

    return { status: 500, message: "Something went wrong! Try again." };
  }

  return { status: 200, message: "Phone number updated successfully" };
}
