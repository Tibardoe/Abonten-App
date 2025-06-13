import type { authUserType } from "@/types/userProfileType";
import { supabase } from "../config/supabase/client";

// const BASE_URL =
//   typeof window !== "undefined"
//     ? window.location.origin
//     : process.env.NEXT_PUBLIC_BASE_URL;

export const signInWithGoogle = async (location: string | null) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/events/${location || "unknown"}`,
    },
  });

  if (error) throw error;

  return data;
};

// Fetch User After OAuth Redirect
export const fetchAuthenticatedUser = async () => {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      console.error("Authentication failed:", error?.message);
      throw new Error(error?.message || "No active session");
    }

    await ensureUserInfoExists(data.user);
    return data.user;
  } catch (error) {
    console.error("User profile verification failed:", error);
    await supabase.auth.signOut(); // Prevent partial auth state
    throw error;
  }
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
  const { data: existingUser, error: selectError } = await supabase
    .from("user_info")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    console.error("Error checking user existence:", selectError.message);
    throw new Error("Failed to verify user profile");
  }

  if (!existingUser) {
    try {
      const userData = {
        id: user.id,
        status_id: 1, // Default status (active)
        username: generateUsername(user),
        full_name: user.user_metadata?.full_name || null,
        avatar_public_id: null,
        avatar_version: null,
        bio: null,
        updated_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from("user_info")
        .insert(userData)
        .select()
        .single();

      if (insertError) {
        console.error("Error creating user profile:", insertError.message);
        throw new Error("Failed to create user profile");
      }

      console.log("Created new user profile for:", user.id);
    } catch (error) {
      console.error("User profile creation failed:", error);
      throw error; // Re-throw to handle in calling function
    }
  }
};

export const signOut = async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
};

const generateUsername = (user: authUserType): string => {
  if (user.email) {
    const base = user.email.split("@")[0];
    return base.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20);
  }
  if (user.phone) {
    return `user_${user.phone.slice(-4)}`;
  }
  return `user_${user.id.slice(0, 8)}`;
};
