// Sentry init for the Node.js server runtime of the admin console (Server
// Components, Route Handlers, Server Actions). Imported from
// src/instrumentation.ts when NEXT_RUNTIME === "nodejs".
//
// Same pattern as apps/web: only enabled in a production build AND only
// when a DSN is configured, so local `next dev` (port 3100) never reports.
// Vercel preview + production both send, separated by the `environment`
// tag. Events land in the `abonten-admin` Sentry project — the DSN value,
// set per Vercel project, is what routes them there.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV,
  // release is injected at build time by the Sentry bundler plugin
  // (git SHA / VERCEL_GIT_COMMIT_SHA) — see next.config.ts.
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
