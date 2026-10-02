// Many small questions asked at the same moment, answered by one request.
//
// A page's header asks a dozen things about the visitor as it opens, each
// from its own hook with its own cache entry. One request can answer them
// all; this hands each asker its part of that one answer, once. Whatever
// an asker needs later (a poll, a refetch after a change) it asks for
// itself, so the shared answer is only ever the page-load one.
//
// `take` resolves to undefined whenever the asker should ask for itself:
//   - it has already taken its part (this is a refetch);
//   - the shared answer is older than `freshForMs` (the asker appeared
//     long after the page opened);
//   - the shared request failed;
//   - the answer was made for someone else (`owner` differs).
//
// One kind of failure is not worth asking about again: the one every asker
// would get too (the account is restricted, the page is older than the
// deployment). `failsTogether` names those, and `take` then rejects with
// the failure instead, so a dozen askers do not each repeat a request that
// has just been refused.

export type SharedFirstAnswer<T extends object> = {
  /** Sends the one request, if it has not been sent. */
  prime(): void;
  /**
   * One part of the answer. `owner` is who the asker believes it is asking
   * for (a user id, or null for "nobody signed in"); leave it out when the
   * part does not depend on who is asking.
   */
  take<K extends keyof T>(
    part: K,
    owner?: string | null,
  ): Promise<T[K] | undefined>;
};

export function createSharedFirstAnswer<T extends object>(options: {
  /** The one request. Resolve to null (or reject) when it cannot answer. */
  ask: () => Promise<T | null>;
  /** Who the answer was made for. */
  ownerOf: (answer: T) => string | null;
  /** How long after the request an asker may still take its part. */
  freshForMs: number;
  /** Whether a failure of the request is every asker's failure. */
  failsTogether?: (error: unknown) => boolean;
  /** The clock, for tests. */
  now?: () => number;
}): SharedFirstAnswer<T> {
  const now = options.now ?? Date.now;
  type Settled = { value: T | null } | { error: unknown };
  let answer: Promise<Settled> | null = null;
  let askedAt = 0;
  const taken = new Set<keyof T>();

  const prime = () => {
    if (answer) return;
    askedAt = now();
    answer = options.ask().then(
      (value): Settled => ({ value }),
      (error): Settled => ({ error }),
    );
  };

  return {
    prime,
    async take(part, owner) {
      // Only a primed answer is shared: an asker never starts the request.
      if (!answer) return undefined;
      if (taken.has(part)) return undefined;
      if (now() - askedAt > options.freshForMs) return undefined;
      taken.add(part);
      const settled = await answer;
      if ("error" in settled) {
        if (options.failsTogether?.(settled.error)) throw settled.error;
        return undefined;
      }
      const { value } = settled;
      if (!value) return undefined;
      if (owner !== undefined && options.ownerOf(value) !== owner) {
        return undefined;
      }
      return value[part];
    },
  };
}
