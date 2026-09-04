import { createApiClient } from "@abonten/api-client";
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
  getAccessToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
  // Sample ~10% of calls into app_request_metric (Admin › Monitoring ›
  // Request telemetry). Off in dev so local traffic doesn't skew it.
  metricSampleRate: __DEV__ ? 0 : 0.1,
});
