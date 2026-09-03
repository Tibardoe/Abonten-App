// Framework-free error-capture helpers for the hybrid observability
// pipeline (see supabase/migrations/20260907090400_observability_tables.sql).
//
// This module does NOT know about fetch config, Next, or React Native. It
// produces a normalized payload + a stable fingerprint; each app wires it
// into its own error boundaries / global handlers and posts to
// POST /api/observability/error, which persists via ingestErrorCore on the
// service-role client. A SENTRY_DSN adapter can be layered on later without
// touching callers.

import type { ObservedPlatform } from "@abonten/types/adminTypes";

export type ErrorSeverity = "info" | "warning" | "error" | "fatal";

export type ErrorReportContext = {
  platform: ObservedPlatform;
  route?: string | null;
  appVersion?: string | null;
  release?: string | null;
  severity?: ErrorSeverity;
  userId?: string | null;
  /** small, non-sensitive extra context — never tokens / PII */
  extra?: Record<string, unknown> | null;
};

export type ErrorEventPayload = {
  fingerprint: string;
  errorType: string;
  message: string;
  stack: string | null;
  platform: ObservedPlatform;
  route: string | null;
  appVersion: string | null;
  release: string | null;
  severity: ErrorSeverity;
  userId: string | null;
  context: Record<string, unknown> | null;
  occurredAt: string;
};

// djb2 — deterministic, dependency-free. Enough to bucket identical errors.
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

// Strip the volatile bits (uuids, numbers, hex, quoted literals) so
// "user 5f3c… not found" and "user 91ab… not found" share a fingerprint.
function normalizeMessage(message: string): string {
  return message
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<uuid>",
    )
    .replace(/0x[0-9a-f]+/gi, "<hex>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "<str>")
    .trim()
    .slice(0, 300);
}

function firstAppFrame(stack: string | null): string {
  if (!stack) return "";
  const lines = stack.split("\n").slice(1);
  for (const line of lines) {
    // skip node internals / framework noise
    if (/node_modules|node:internal|\[native code\]/.test(line)) continue;
    return line
      .trim()
      .replace(/:\d+:\d+\)?$/, "")
      .slice(0, 200);
  }
  return (lines[0] ?? "").trim().slice(0, 200);
}

export function toErrorParts(err: unknown): {
  errorType: string;
  message: string;
  stack: string | null;
} {
  if (err instanceof Error) {
    return {
      errorType: err.name || "Error",
      message: err.message || String(err),
      stack: err.stack ?? null,
    };
  }
  if (typeof err === "string")
    return { errorType: "Error", message: err, stack: null };
  try {
    return {
      errorType: "Error",
      message: JSON.stringify(err).slice(0, 500),
      stack: null,
    };
  } catch {
    return { errorType: "Error", message: String(err), stack: null };
  }
}

export function computeFingerprint(
  errorType: string,
  message: string,
  stack: string | null,
  platform: ObservedPlatform,
  route?: string | null,
): string {
  return hash(
    [
      platform,
      errorType,
      normalizeMessage(message),
      firstAppFrame(stack),
      route ?? "",
    ].join("|"),
  );
}

export function buildErrorEventPayload(
  err: unknown,
  ctx: ErrorReportContext,
): ErrorEventPayload {
  const { errorType, message, stack } = toErrorParts(err);
  const route = ctx.route ?? null;
  return {
    fingerprint: computeFingerprint(
      errorType,
      message,
      stack,
      ctx.platform,
      route,
    ),
    errorType,
    message: message.slice(0, 2000),
    stack: stack ? stack.slice(0, 8000) : null,
    platform: ctx.platform,
    route,
    appVersion: ctx.appVersion ?? null,
    release: ctx.release ?? null,
    severity: ctx.severity ?? "error",
    userId: ctx.userId ?? null,
    context: ctx.extra ?? null,
    occurredAt: new Date().toISOString(),
  };
}

export type PostFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    keepalive?: boolean;
  },
) => Promise<unknown>;

// Fire-and-forget. Never throws — an observability failure must not break
// the caller. `post` is injected (globalThis.fetch in practice).
export async function sendErrorReport(
  payload: ErrorEventPayload,
  opts: { endpoint: string; headers?: Record<string, string>; post: PostFn },
): Promise<void> {
  try {
    await opts.post(opts.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // swallow — nothing we can do, and logging here could loop
  }
}
