// Sentry init for the Edge runtime (proxy.ts / middleware, and any route
// with `export const runtime = "edge"`). Imported from src/instrumentation.ts
// when NEXT_RUNTIME === "edge". Same gating as the server config.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

const environment =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV;

Sentry.init({
  dsn,
  // CI builds the site for production and runs the browser suite against a
  // local stack with environment "ci": its errors are not production's.
  enabled:
    Boolean(dsn) &&
    process.env.NODE_ENV === "production" &&
    environment !== "ci",
  environment,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
