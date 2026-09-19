// Next.js instrumentation entrypoint. `register()` runs once per server
// process: it verifies the deployment's configuration and loads the Sentry
// init for whichever runtime is active. The `onRequestError` hook forwards
// uncaught errors from Server Components, Route Handlers and Server Actions
// to Sentry.

import { checkEnv, enforceEnv } from "@abonten/core/env/checkEnv";
import { logger } from "@abonten/core/logger";
import * as Sentry from "@sentry/nextjs";

// What the web app cannot serve traffic without, and what it degrades
// without. Names only; see docs/security/secrets-and-environment.md.
const WEB_ENV = {
  required: [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "PAYSTACK_SECRET_KEY",
    "PAYSTACK_WEBHOOK_SECRET",
    "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    "OBSERVABILITY_INGEST_SECRET",
  ],
  recommended: [
    "RESEND_API_KEY",
    "HUBTEL_API_CLIENT_ID",
    "HUBTEL_API_CLIENT_SECRET",
    "NEXT_PUBLIC_SENTRY_DSN",
    "WEB_PUSH_VAPID_PUBLIC_KEY",
    "WEB_PUSH_VAPID_PRIVATE_KEY",
    "WEB_PUSH_SUBJECT",
  ],
} as const;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // A production deployment with a required variable missing must not
    // come up; anywhere else (dev, preview, CI build) the gap is logged.
    enforceEnv(checkEnv(process.env, WEB_ENV), {
      app: "web",
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
