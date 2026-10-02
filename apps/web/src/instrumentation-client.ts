// Sentry init for the browser. Next.js loads this automatically on the
// client (replaces the old sentry.client.config.ts). Only the PUBLIC DSN is
// referenced here — never an auth token or any server secret.
//
// Same gating as the server config: disabled unless this is a production
// build with a DSN, so `next dev` sessions never reach the production
// project.

import { announceNavigationStart } from "@/lib/navigationSignal";
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

// Next.js calls this when a navigation starts, whatever started it (a link,
// router.push, the Back button). Sentry traces it; the progress bar at the
// top of the window is told too (lib/navigationSignal.ts).
export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse",
) {
  Sentry.captureRouterTransitionStart(url, navigationType);
  announceNavigationStart(url);
}
