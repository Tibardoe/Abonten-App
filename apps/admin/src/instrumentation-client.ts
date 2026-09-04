// Sentry init for the admin console browser bundle. Next.js loads this
// automatically on the client. Only the PUBLIC DSN is referenced here —
// never an auth token or any server secret.
//
// Disabled unless this is a production build with a DSN, so `next dev`
// sessions never reach the production project.

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

// Instruments client-side App Router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
