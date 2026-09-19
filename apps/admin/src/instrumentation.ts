// Next.js instrumentation entrypoint for the admin console. `register()`
// runs once per server process: it verifies the deployment's configuration
// and loads the Sentry init for whichever runtime is active.
// `onRequestError` forwards uncaught errors from Server Components, Route
// Handlers and Server Actions to Sentry.

import { checkEnv, enforceEnv } from "@abonten/core/env/checkEnv";
import { logger } from "@abonten/core/logger";
import * as Sentry from "@sentry/nextjs";

// ADMIN_EMAIL_ALLOWLIST is required on purpose: an empty allowlist disables
// the console's first gate, which must never happen in production.
const ADMIN_ENV = {
  required: [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ADMIN_EMAIL_ALLOWLIST",
    "OBSERVABILITY_INGEST_SECRET",
  ],
  recommended: [
    "NEXT_PUBLIC_SENTRY_DSN",
    "PAYSTACK_SECRET_KEY",
    "GOOGLE_MAPS_API_KEY",
  ],
} as const;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    enforceEnv(checkEnv(process.env, ADMIN_ENV), {
      app: "admin",
      strict: process.env.VERCEL_ENV === "production",
      log: logger,
    });
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
