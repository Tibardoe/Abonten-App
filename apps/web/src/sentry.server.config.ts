// Sentry init for the Node.js server runtime (Server Components, Route
// Handlers, Server Actions). Imported from src/instrumentation.ts when
// NEXT_RUNTIME === "nodejs".
//
// Gating: only enabled in a production build (`next build` / `next start`,
// Vercel preview + production) AND only when a DSN is configured. Local
// `next dev` (NODE_ENV !== "production") never sends — dev errors stay out
// of the production project. Preview vs production is distinguished by the
// `environment` tag, not by disabling one of them.

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
  // Don't attach IPs / request headers / cookies to events.
  sendDefaultPii: false,
});
