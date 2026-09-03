import {
  buildErrorEventPayload,
  sendErrorReport,
} from "@abonten/core/reportError";

// Client-side crash reporter for the web app. Wired into the App Router
// error boundaries (error.tsx / global-error.tsx). Fire-and-forget — never
// rethrows. The ingest route authenticates the browser session itself.
export function reportClientError(
  err: unknown,
  ctx?: { route?: string | null; extra?: Record<string, unknown> | null },
): void {
  try {
    const payload = buildErrorEventPayload(err, {
      platform: "web",
      route:
        ctx?.route ??
        (typeof window !== "undefined" ? window.location.pathname : null),
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      severity: "error",
      extra: ctx?.extra ?? null,
    });
    void sendErrorReport(payload, {
      endpoint: "/api/observability/error",
      post: (url, init) => fetch(url, init as RequestInit),
    });
  } catch {
    /* observability must never break the app */
  }
}
