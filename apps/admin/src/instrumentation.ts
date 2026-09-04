// Next.js instrumentation entrypoint for the admin console. `register()`
// runs once per server process; it loads the Sentry init for whichever
// runtime is active. `onRequestError` forwards uncaught errors from Server
// Components, Route Handlers and Server Actions to Sentry.

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
