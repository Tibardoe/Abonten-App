import {
  type ErrorReportContext,
  buildErrorEventPayload,
  sendErrorReport,
} from "@abonten/core/reportError";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// Native crash reporter for the hybrid observability pipeline — the mobile
// counterpart of apps/web/src/lib/reportClientError.ts. Wired into the root
// Expo Router ErrorBoundary and the global JS error handler
// (src/lib/errorTracking.ts). Fire-and-forget: it never throws and never
// blocks a render.
//
// POST /api/observability/error accepts a Supabase bearer token OR the
// server-to-server secret; we send the current session token when there is
// one so the error is attributed to the user, but an anonymous crash still
// gets through (userId stays null).

const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const appVersion = Constants.expoConfig?.version ?? null;
// runtimeVersion pins the JS bundle to a native build — the closest thing to
// a release id without a git SHA on device.
const release =
  typeof Constants.expoConfig?.runtimeVersion === "string"
    ? Constants.expoConfig.runtimeVersion
    : null;

export function reportClientError(
  err: unknown,
  ctx?: {
    route?: string | null;
    severity?: ErrorReportContext["severity"];
    extra?: Record<string, unknown> | null;
  },
): void {
  try {
    if (!baseUrl) return;

    const payload = buildErrorEventPayload(err, {
      platform: "mobile",
      route: ctx?.route ?? null,
      appVersion,
      release,
      severity: ctx?.severity ?? "error",
      extra: ctx?.extra ?? null,
    });

    void (async () => {
      let token: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token ?? null;
      } catch {
        /* no session — report anonymously */
      }
      await sendErrorReport(payload, {
        endpoint: `${baseUrl}/api/observability/error`,
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        post: (url, init) => fetch(url, init as RequestInit),
      });
    })();
  } catch {
    /* observability must never break the app */
  }
}
