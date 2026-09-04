import * as Sentry from "@sentry/nextjs";

// One place for every Sentry knob the admin console uses, so the three
// runtime entrypoints (instrumentation-client.ts / sentry.server.config.ts
// / sentry.edge.config.ts) stay identical and can't drift.
//
// Nothing here is app logic — it's filtering + redaction + the option
// factory. The `abonten-admin` Sentry project is the ONLY monitoring sink
// for this app (there is no self-hosted error pipeline client in
// apps/admin), so the rules below decide what that project ever sees.

type SentryInitOptions = Parameters<typeof Sentry.init>[0];
type SentryRuntime = "browser" | "server" | "edge";

// The event shapes passed to beforeSend / beforeSendTransaction, derived
// from the option type so we don't depend on which event type names the
// SDK happens to re-export.
type SentryOutgoingEvent =
  | Parameters<NonNullable<SentryInitOptions["beforeSend"]>>[0]
  | Parameters<NonNullable<SentryInitOptions["beforeSendTransaction"]>>[0];

// Errors the guard throws on every non-allowlisted / disabled-admin hit.
// They are the expected outcome of the auth boundary doing its job — not
// incidents — so they must never reach Sentry (they would drown real
// signal). `redirect()` / `notFound()` control-flow throws are already
// dropped by @sentry/nextjs itself.
const EXPECTED_ERROR_NAMES = new Set([
  "AdminUnauthenticatedError",
  "AdminForbiddenError",
]);

// Extra belt-and-braces on top of `ignoreErrors` string matching.
export const ADMIN_IGNORE_ERRORS = [
  "AdminUnauthenticatedError",
  "AdminForbiddenError",
  // benign browser noise
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications.",
  "AbortError",
  "Non-Error promise rejection captured",
];

const SENSITIVE_HEADER =
  /^(cookie|authorization|proxy-authorization|x-.*-(token|key|secret)|x-supabase.*|x-forwarded-for|x-real-ip)$/i;
const SENSITIVE_KEY =
  /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|session|service[-_]?role|bearer|otp|card|cvv|pan|paystack)/i;
const SENSITIVE_QS =
  /([?&](?:access_token|refresh_token|token|code|api_key|apikey|secret|password|otp)=)[^&#]*/gi;

function redactString(value: string): string {
  return value.replace(SENSITIVE_QS, "$1[redacted]");
}

function redactRecord(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEY.test(key)) {
      obj[key] = "[redacted]";
      continue;
    }
    const val = obj[key];
    if (typeof val === "string") obj[key] = redactString(val);
    else if (val && typeof val === "object" && !Array.isArray(val)) {
      redactRecord(val as Record<string, unknown>);
    }
  }
}

// Strip anything that could carry a credential or PII before an event
// leaves the process. `sendDefaultPii: false` already keeps Sentry from
// attaching cookies / IPs / headers itself; this also covers data we put
// on the event ourselves (breadcrumbs, extra, request info the framework
// captured).
function scrubEvent<T extends SentryOutgoingEvent>(event: T): T {
  if (event.request) {
    event.request.cookies = undefined;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADER.test(name)) delete event.request.headers[name];
      }
    }
    if (typeof event.request.query_string === "string") {
      event.request.query_string = redactString(event.request.query_string);
    }
    if (typeof event.request.url === "string") {
      event.request.url = redactString(event.request.url);
    }
    if (event.request.data && typeof event.request.data === "object") {
      redactRecord(event.request.data as Record<string, unknown>);
    }
  }
  if (event.extra) redactRecord(event.extra);
  if (event.contexts) redactRecord(event.contexts as Record<string, unknown>);
  for (const b of event.breadcrumbs ?? []) {
    if (b.data) redactRecord(b.data);
    if (typeof b.message === "string") b.message = redactString(b.message);
  }
  return event;
}

function resolveDsn(runtime: SentryRuntime): string | undefined {
  if (runtime === "browser") return process.env.NEXT_PUBLIC_SENTRY_DSN;
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
}

// production | preview | development — Vercel sets VERCEL_ENV on the
// server and NEXT_PUBLIC_VERCEL_ENV in the browser bundle. Falls back to
// NODE_ENV for a plain local build.
function resolveEnvironment(runtime: SentryRuntime): string {
  const explicit = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
  if (explicit) return explicit;
  const vercelEnv =
    runtime === "browser"
      ? process.env.NEXT_PUBLIC_VERCEL_ENV
      : process.env.VERCEL_ENV;
  return vercelEnv || process.env.NODE_ENV || "development";
}

/**
 * The full option set for `Sentry.init()`, identical across all three
 * runtimes bar the DSN / environment source. Only reports from a
 * production build with a DSN configured, so `next dev` on port 3100
 * never touches the project; Vercel preview and production both send and
 * are told apart by the `environment` tag.
 */
export function adminSentryOptions(runtime: SentryRuntime): SentryInitOptions {
  const dsn = resolveDsn(runtime);
  return {
    dsn,
    enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
    environment: resolveEnvironment(runtime),
    // release is injected at build time by the Sentry bundler plugin
    // (VERCEL_GIT_COMMIT_SHA) — see next.config.ts.
    tracesSampleRate: 0.1,
    // Never let Sentry attach IPs / request headers / cookies on its own.
    sendDefaultPii: false,
    ignoreErrors: ADMIN_IGNORE_ERRORS,
    beforeSend(event, hint) {
      const name = (hint?.originalException as { name?: string } | undefined)
        ?.name;
      if (name && EXPECTED_ERROR_NAMES.has(name)) return null;
      return scrubEvent(event);
    },
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb(breadcrumb) {
      // Drop auth/token traffic breadcrumbs entirely; scrub the rest.
      const url =
        typeof breadcrumb.data?.url === "string" ? breadcrumb.data.url : "";
      if (/\/auth\/|token|\/api\/.*secret/i.test(url)) return null;
      if (breadcrumb.data) redactRecord(breadcrumb.data);
      return breadcrumb;
    },
  };
}

// ── request-scoped enrichment (server) ────────────────────────
// Called from requireAdmin() once the caller is a verified active admin.
// @sentry/nextjs isolates scope per request, so this tags only the
// current request's events. Identity is the admin's user id + role keys —
// no email, no other PII.
export function tagAdminRequest(ctx: {
  userId: string;
  roles: readonly string[];
}): void {
  Sentry.setUser({ id: ctx.userId });
  Sentry.setTag("admin.roles", ctx.roles.join(",") || "none");
  Sentry.addBreadcrumb({
    category: "admin.auth",
    level: "info",
    message: "admin context resolved",
    data: { roles: ctx.roles.join(",") },
  });
}

// Bridge for swallowed Server Action failures: the action catches the
// throw and returns a { status, message } envelope, so Next's
// onRequestError never sees it. Forward the genuinely unexpected ones
// (not the guard's expected errors) to Sentry with an admin.action tag.
export function captureAdminActionError(err: unknown, action?: string): void {
  const name = (err as { name?: string } | undefined)?.name;
  if (name && EXPECTED_ERROR_NAMES.has(name)) return;
  Sentry.captureException(err, {
    tags: {
      source: "admin_server_action",
      ...(action ? { "admin.action": action } : {}),
    },
    level: "error",
  });
}

export { Sentry };
