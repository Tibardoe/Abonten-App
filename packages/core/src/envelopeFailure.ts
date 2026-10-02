// Operations answer with an envelope, { status, message?, data? }, and never
// throw. That is right for a write (the caller reads `status` and says what
// happened) and wrong for a cached read: a data cache that is handed
// { status: 500 } stores it as the answer. The list someone was looking at
// is replaced by "there is nothing here", no retry runs, and the screen's
// own "couldn't load, try again" state never shows.
//
// This draws the line for reads. A TRANSIENT failure (the server failed, was
// busy, or was never reached) is not an answer: the read failed and should
// be retried. Everything else is a definite answer the screen has something
// true to say about ("sign in", "not found", "not allowed", "invalid").
//
// The native app applies the same rule per query (apps/mobile/src/lib/
// envelope.ts, where a 401 is transient too because the token is being
// refreshed); the web app applies it to every query at once
// (apps/web/src/providers/envelopeQueryClient.ts).

/** Not an answer: unreachable (0), timed out, rate limited, server error. */
export function isTransientFailureStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export type FailedRead = { status: number; message?: string };

/**
 * The failure a read came back with, or null when `value` is an answer
 * (including anything that is not an envelope at all: a page of a list, a
 * plain array, null).
 */
export function failedReadOf(value: unknown): FailedRead | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const { status, message } = value as { status?: unknown; message?: unknown };
  if (typeof status !== "number" || !Number.isFinite(status)) return null;
  if (!isTransientFailureStatus(status)) return null;
  return typeof message === "string" ? { status, message } : { status };
}

/**
 * A read that failed. `status` is read by retry policies. `message` is the
 * envelope's own (already in the reader's language) or empty, so a screen
 * that prints `error.message || fallback` falls back to its own words.
 */
export class FailedReadError extends Error {
  readonly status: number;
  constructor(failure: FailedRead) {
    super(failure.message ?? "");
    this.name = "FailedReadError";
    this.status = failure.status;
  }
}

/** Returns `value`, or throws when it is the envelope of a failed read. */
export function answerOrThrow<T>(value: T): T {
  const failure = failedReadOf(value);
  if (failure) throw new FailedReadError(failure);
  return value;
}
