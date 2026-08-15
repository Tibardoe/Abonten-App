import { supabase } from "../config/supabase/client";

export const signInWithGoogle = async (
  location: string | null,
  next?: string | null,
) => {
  const target = next || `/events/location/${location || "unknown"}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
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

    // await ensureUserInfoExists(data.user);

    return data.user;
  } catch (error) {
    console.error("User profile verification failed:", error);
    await supabase.auth.signOut(); // Prevent partial auth state
    throw error;
  }
};

// Phone sign-in OTP send/verify now live server-side in
// src/actions/sendPhoneOtp.ts and src/actions/verifyPhoneOtp.ts —
// the Hubtel credentials must never be readable from the browser bundle.
// (Supabase session creation after OTP verification is still commented out
// there, same as before this change — phone sign-in remains incomplete.)

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

export const signOut = async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
};
