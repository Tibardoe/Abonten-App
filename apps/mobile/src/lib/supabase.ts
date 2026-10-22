import "react-native-url-polyfill/auto";
import { fetchWithTimeout } from "@abonten/core/http/fetchWithTimeout";
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

// React Native's fetch has no deadline on Android, and with an expired token
// every getSession() waits for the refresh in flight. A refresh that never
// got an answer (a half-open connection, a captive portal, a stalled tunnel)
// therefore held them all for good: the app's requests, the start-up screen
// and an SOS hung. Auth calls get a deadline; a timed-out one is an ordinary
// retryable failure to supabase-js (the session stays stored and refreshes
// on the next tick). Data calls are left alone.
const AUTH_REQUEST_DEADLINE_MS = 15_000;

function fetchWithAuthDeadline(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : null;
  if (!url?.includes("/auth/v1/")) return fetch(input, init);
  return fetchWithTimeout(url, {
    ...init,
    timeoutMs: AUTH_REQUEST_DEADLINE_MS,
  });
}

export const supabase: SupabaseClient<Database> = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    global: { fetch: fetchWithAuthDeadline },
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

  // AppState only emits "change" on a *transition*. A cold start is already
  // "active", so without this the refresh ticker would never start until the
  // app was backgrounded and foregrounded once — and a foregrounded session
  // older than the access-token TTL (~1h) would then 401 every /api/mobile
  // call until the app was restarted.
  if (AppState.currentState === "active") {
    supabase.auth.startAutoRefresh();
  }

  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
