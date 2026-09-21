// The typed /api/mobile client returns HTTP failures as data
// (`{ status, message }`) instead of throwing. That suits mutations, which
// branch on the status, but in a QUERY it means React Query records the
// failure as a success: a background refetch that hits a 503 replaces the
// conversation list or post someone was looking at with an error value,
// and no retry ever runs.
//
// `settleEnvelope` draws the line for queries. A TRANSIENT failure — the
// session being refreshed (401), a timeout, rate limiting, a server error —
// throws, so React Query keeps the last good data, retries with backoff and
// refetches on reconnect. A DEFINITE answer ("not found", "gone", "not
// allowed", "invalid") is returned as data, because the screen has
// something true to say about it (an ended Story, a thread you left).

export class EnvelopeError extends Error {
  /** Read by queryClient's auth-expiry check and retry policy. */
  readonly status: number;
  constructor(status: number, message?: string) {
    super(message ?? `Request failed (${status})`);
    this.name = "EnvelopeError";
    this.status = status;
  }
}

function isTransient(status: number): boolean {
  return status === 401 || status === 408 || status === 429 || status >= 500;
}

export function settleEnvelope<T extends { status: number; message?: string }>(
  res: T,
): T {
  if (isTransient(res.status)) throw new EnvelopeError(res.status, res.message);
  return res;
}
