import { createApiClient } from "@abonten/api-client";
import { Platform } from "react-native";
import { getInstallId } from "./installId";
import { handleAuthExpiry } from "./queryClient";
import { supabase } from "./supabase";

const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!baseUrl) {
  throw new Error(
    "Missing EXPO_PUBLIC_API_BASE_URL — set it in apps/mobile/.env (origin of the web deployment serving /api/mobile).",
  );
}

// Typed client over apps/web/src/app/api/mobile/**. The access token is read
// from the current Supabase session on every request, so a refreshed token
// is always used; the phone-auth endpoints ignore it.
export const api = createApiClient({
  baseUrl,
  // The typed client returns HTTP error statuses in the body instead of
  // throwing, so React Query's queryCache.onError never sees a 401 from
  // /api/mobile and the "session died -> sign out" path never ran: the app
  // stayed signed-in-looking while every authenticated screen failed, the
  // profile fell back to "Your account" + a raw phone number, and the only
  // advice on screen was "pull down to try again", which could never
  // succeed. Watching the transport is the one place that catches it for
  // all ~179 routes at once. Only acts when a session actually exists, so a
  // 401 from a pre-login endpoint can't bounce a signed-out user.
  fetch: async (input, init) => {
    const response = await fetch(input, init);

    if (response.status === 401) {
      // Only the token this request actually used may condemn the session.
      // A 401 for an OLDER token can land after a NEWER session exists — a
      // background poll fired while signed out, answering just after the
      // user finished signing in — and signing out on that would tear down
      // the session they had only just created.
      const sent = new Headers(init?.headers).get("authorization");
      const { data } = await supabase.auth.getSession();
      const current = data.session?.access_token;

      // handleAuthExpiry confirms with the auth server before signing out,
      // so a one-off 401 here costs a single extra call and nothing else.
      if (current && sent === `Bearer ${current}`) void handleAuthExpiry();
    }

    return response;
  },
  getAccessToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
  // Sample ~10% of calls into app_request_metric (Admin › Monitoring ›
  // Request telemetry). Off in dev so local traffic doesn't skew it.
  metricSampleRate: __DEV__ ? 0 : 0.1,
  // Rewards fraud signal only (see installId.ts).
  getInstallId,
  platform: Platform.OS === "ios" ? "ios" : "android",
});
