import { supabase } from "@/lib/supabase";
import { translatorFor } from "@abonten/ui-native/i18n";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";

// Native Sign in with Apple (App Review Guideline 4.8: an app that offers
// Google sign-in must offer an equivalent private option on iOS). Apple
// hands back an identity token, which Supabase exchanges for a session —
// no browser, no redirect.
//
// Needs, outside the code: the Apple provider switched on in Supabase Auth
// with the bundle id (com.abonten.app) as an authorized client id, and a
// native build (the capability comes from `ios.usesAppleSignIn`). A build
// without the native module reports "not available", so the button simply
// doesn't show there — never a crash from an over-the-air update.

/** True only on an iPhone/iPad build that includes Sign in with Apple. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; message: string }
> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e) {
    // Closing Apple's sheet is a choice, not an error.
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") {
      return { ok: false, cancelled: true };
    }
    return {
      ok: false,
      message: translatorFor("auth")("appleSignInDidnTFinish"),
    };
  }

  if (!credential.identityToken) {
    return {
      ok: false,
      message: translatorFor("auth")("appleDidnTReturnASign"),
    };
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  });
  if (error || !data.user) {
    return {
      ok: false,
      message:
        error?.message ?? translatorFor("auth")("couldnTFinishSigningInWith"),
    };
  }

  // Apple shares the person's name only the first time they sign in, and
  // never inside the token, so keep it now — only when the profile has no
  // name yet (someone who already set one keeps theirs). A failure here is
  // harmless: the account-setup reminder asks for a name.
  const name = credential.fullName
    ? AppleAuthentication.formatFullName(credential.fullName).trim()
    : "";
  if (name) {
    await supabase
      .from("user_info")
      .update({ full_name: name })
      .eq("id", data.user.id)
      .is("full_name", null);
  }

  return { ok: true };
}
