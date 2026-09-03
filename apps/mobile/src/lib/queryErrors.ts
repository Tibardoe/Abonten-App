// A resource genuinely doesn't exist (or isn't visible to this user) — a
// deterministic outcome, not a transient failure. Detail hooks throw this
// instead of a plain Error so the shared queryClient retry predicate can
// skip the (pointless) backoff retries and the screen shows its "not found"
// state immediately. `entity` is only for logging/debugging.
export class NotFoundError extends Error {
  readonly isNotFound = true as const;

  constructor(entity: string) {
    super(`${entity} not found`);
    this.name = "NotFoundError";
  }
}

export function isNotFoundError(error: unknown): error is NotFoundError {
  return (
    error instanceof NotFoundError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { isNotFound?: unknown }).isNotFound === true)
  );
}
