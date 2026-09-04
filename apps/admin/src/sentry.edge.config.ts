// Sentry init for the Edge runtime (proxy.ts / middleware). Imported from
// src/instrumentation.ts when NEXT_RUNTIME === "edge". Same gating as the
// server config.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
