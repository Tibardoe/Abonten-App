import { supabase } from "@/lib/supabase";
import { translatorFor } from "@abonten/ui-native/i18n";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

// Native Google sign-in. Opens the system auth session, waits for the
// `abonten://auth/callback?code=…` redirect, then exchanges the PKCE code
// for a Supabase session (persisted to secure-store by the client).
//
// Requires, in Supabase Auth settings: the redirect URL below added to the
// allow list, and Google configured as a provider.
export async function signInWithGoogle(): Promise<
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; message: string }
> {
  const redirectTo = Linking.createURL("auth/callback");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data?.url) {
    return {
      ok: false,
      message:
        error?.message ?? translatorFor("auth")("couldnTStartGoogleSignIn"),
    };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  // Closing the Google page is a choice, not an error: nothing to report.
  if (result.type === "cancel" || result.type === "dismiss") {
    return { ok: false, cancelled: true };
  }
  if (result.type !== "success") {
    return {
      ok: false,
      message: translatorFor("auth")("googleSignInDidnTFinish"),
    };
  }

  const code = new URL(result.url).searchParams.get("code");

  if (!code) {
    return {
      ok: false,
      message: translatorFor("auth")("googleSignInReturnedNoCode"),
    };
  }

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return { ok: false, message: exchangeError.message };
  }

  return { ok: true };
}
