import { supabase } from "../config/supabase/client";

export const signInWithGoogle = async (
  location: string | null,
  next?: string | null,
) => {
  // `location` here is already slugified by the caller (GoogleAuthButton.tsx
  // passes generateSlug(location ?? "")) -- matches the /explore/[location]
  // landing pattern used by Header.tsx/SideBar.tsx/MobileNavBar.tsx, not the
  // old /events/location/[location] route.
  const target = next || `/explore/${location || ""}`;

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

// Phone sign-in OTP send/verify + session minting: see
// src/actions/requestPhoneVerification.ts and
// src/actions/verifyPhoneSignIn.ts. Settings -> Security's add/change-phone
// flow: see src/actions/updateVerifiedPhone.ts. All server-side — Hubtel
// credentials and the Supabase service-role key must never be readable
// from the browser bundle.

export const signOut = async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
};
