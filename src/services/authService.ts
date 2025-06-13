import type { authUserType } from "@/types/userProfileType";
import { supabase } from "../config/supabase/client";

export const signInWithGoogle = async (location: string | null) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `/events/${location || "unknown"}`,
    },
  });

  if (error) throw error;

  return data;
};

// Fetch User After OAuth Redirect
export const fetchAuthenticatedUser = async () => {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    console.error("No active session found.", error?.message);
    return null;
  }

  const user = data.user;

  // Ensure `user_info` exists
  await ensureUserInfoExists(user);

  return user;
};

export const signInWithPhone = async (phone: string) => {
  const { error } = await supabase.auth.signInWithOtp({ phone });

  if (error) throw error;
};

export const verifyOtp = async (phone: string, otp: string) => {
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token: otp,
    type: "sms",
  });

  if (error) {
    console.log(`Error verifying OTP: ${error.message}`);

    if (error.message.includes("expired")) {
      return {
        status: 401,
        message: "OTP has expired. Please request a new one.",
      };
      // throw new Error("OTP has expired. Please request a new one.");
    }
    throw error;
  }

  // Ensure user exists in `user_info` after phone sign-in
  if (data?.user) {
    await ensureUserInfoExists(data?.user);
  }

  return { status: 200, data, message: "OTP verfied successfully!" };
};

export const updatePhoneNumberInUserTable = async (phone: string) => {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    console.error(
      "Could not authenticate user before updating phone.",
      userError?.message,
    );
    return { status: 401, message: "User not authenticated." };
  }

  const { error: updatePhoneNumberError } = await supabase.auth.updateUser({
    phone: phone,
  });

  if (updatePhoneNumberError) {
    console.log(
      `Error updating user phone number: ${updatePhoneNumberError.message}`,
    );

    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Phone number updated successfully." };
};

const ensureUserInfoExists = async (user: authUserType) => {
  try {
    // Check if the user already exists in `user_info`
    const { data, error } = await supabase
      .from("user_info")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!data || error) {
      console.log("Creating new user_info entry...");

      const { error: insertError } = await supabase.from("user_info").insert({
        id: user.id, // Match `auth.users.id`
        status_id: 1, // Default status
        username: user.email
          ? user.email.split("@")[0]
          : `user_${user.id.slice(0, 8)}`, // Generate username from email if exists, else use UID
        full_name: user.user_metadata?.full_name || null,
        avatar_public_id: null,
        avatar_version: null,
        bio: null,
        updated_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error("Error inserting user_info:", insertError.message);
      }
    }
  } catch (error) {
    console.error("Error ensuring user exists in user_info:", error);
  }
};

export const signOut = async () => {
  await supabase.auth.signOut();
  window.location.reload();
};
