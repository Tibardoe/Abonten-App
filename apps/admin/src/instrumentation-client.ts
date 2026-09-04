// Sentry init for the admin console browser bundle. Next.js loads this
// automatically on the client. Only the PUBLIC DSN is referenced here —
// never an auth token or any server secret.
//
// Shared gating / filtering / redaction lives in ./lib/sentry. Disabled
// unless this is a production build with a DSN, so `next dev` sessions
// never reach the production project.

import * as Sentry from "@sentry/nextjs";
import { adminSentryOptions } from "./lib/sentry";

Sentry.init(adminSentryOptions("browser"));

// Instruments client-side App Router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
