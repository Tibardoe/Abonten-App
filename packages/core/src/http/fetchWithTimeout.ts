// One fetch wrapper for every server-to-server call this platform makes
// (Paystack, Hubtel, Expo push, Google Geocoding, Cloudinary, ipapi). A
// plain `fetch` has no deadline: a provider that accepts the TCP connection
// and then stalls holds the serverless function until the platform kills it
// (Vercel: up to the route's maxDuration), which on the money path means a
// payment finaliser that neither succeeds nor fails, and everywhere else a
// request that costs the caller a full timeout before the UI can react.
//
// Every caller therefore states a deadline. A stalled request rejects with
// `FetchTimeoutError`, which is distinguishable from a network error so a
// caller can decide whether the operation is retryable (Paystack verify:
// yes, the reference is the idempotency key) or must be treated as unknown.

export class FetchTimeoutError extends Error {
  readonly url: string;
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number) {
    super(`Request to ${safeUrl(url)} timed out after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

export type FetchWithTimeoutInit = RequestInit & {
  /** Deadline for the whole request, headers and body included. */
  timeoutMs: number;
};

/** Never echo a query string into logs or error messages: it can carry keys. */
function safeUrl(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export function isFetchTimeoutError(
  error: unknown,
): error is FetchTimeoutError {
  return error instanceof FetchTimeoutError;
}

/**
 * `fetch` with a hard deadline. Honours a caller-supplied `signal` as well:
 * whichever aborts first wins, and only the deadline path is reported as a
 * `FetchTimeoutError`.
 */
export async function fetchWithTimeout(
  input: string | URL,
  init: FetchWithTimeoutInit,
): Promise<Response> {
  const { timeoutMs, signal: outerSignal, ...rest } = init;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(
      `fetchWithTimeout: timeoutMs must be > 0, got ${timeoutMs}`,
    );
  }

  const url = typeof input === "string" ? input : input.toString();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const forwardOuterAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else
      outerSignal.addEventListener("abort", forwardOuterAbort, { once: true });
  }

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new FetchTimeoutError(url, timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener("abort", forwardOuterAbort);
  }
}

/**
 * Deadlines per provider, in one place so they are reviewed together. The
 * values are generous relative to each provider's usual latency and short
 * relative to the function limits they protect.
 */
export const HTTP_TIMEOUTS = {
  /** Charge / initialise / refund: Paystack acknowledges quickly; the money
   *  outcome is confirmed by verify + webhook, never by this call alone. */
  paystackWrite: 20_000,
  /** Verify is retried by the client, the webhook and reconciliation. */
  paystackRead: 15_000,
  hubtelOtp: 10_000,
  expoPush: 10_000,
  webPush: 10_000,
  googleGeocode: 8_000,
  cloudinary: 8_000,
  ipLookup: 3_000,
} as const;

export class DeadlineError extends Error {
  readonly label: string;
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`${label} did not finish within ${timeoutMs}ms`);
    this.name = "DeadlineError";
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Deadline for an SDK call that cannot take an AbortSignal (Resend, the
 * Cloudinary admin API). The underlying request keeps running, so this only
 * bounds how long the caller waits; use `fetchWithTimeout` when the request
 * itself can be cancelled.
 */
export async function withDeadline<T>(
  work: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DeadlineError(label, timeoutMs)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
