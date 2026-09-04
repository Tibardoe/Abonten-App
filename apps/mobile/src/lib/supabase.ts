import "react-native-url-polyfill/auto";
import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { secureStorage } from "./secureStore";

// Native Supabase client for the mobile app. Same project as the web app;
// only the public URL + anon key are used (both inlined via EXPO_PUBLIC_*).
// The session lives in expo-secure-store (chunked — see secureStore.ts), not
// in cookies. Direct reads/writes here are still governed by RLS exactly as
// on the web; anything needing a secret goes through /api/mobile/**.

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copy apps/mobile/.env.example to apps/mobile/.env.",
  );
}

export const supabase: SupabaseClient<Database> = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      // No URL-based session detection on native — auth is via secure-store
      // and the explicit OAuth deep-link handler.
      detectSessionInUrl: false,
      // PKCE for the native Google flow: signInWithOAuth returns a `?code=`
      // on the abonten:// redirect, completed with exchangeCodeForSession.
      flowType: "pkce",
    },
  },
);

// Supabase recommends driving token auto-refresh off foreground state on
// native: refresh while the app is active, stop while backgrounded.
let appStateSubscribed = false;

export function startSupabaseAutoRefresh(): void {
  if (appStateSubscribed) return;
  appStateSubscribed = true;

  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
