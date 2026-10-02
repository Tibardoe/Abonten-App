// A small memory of recent answers: each is kept for a fixed time and the
// oldest is dropped when there are too many. For answers that are asked
// for in bursts and may be a few seconds old (see the web proxy, which
// remembers a session the auth server has just confirmed). It lives in one
// server instance's memory: it is a saving, never a source of truth.

export type RecentCache<V> = {
  /** The remembered value, or undefined when there is none or it is old. */
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): void;
  readonly size: number;
};

export function createRecentCache<V>(options: {
  /** How long an answer may be reused. */
  ttlMs: number;
  /** How many answers are kept; the oldest goes first. */
  limit: number;
  /** The clock, for tests. */
  now?: () => number;
}): RecentCache<V> {
  const now = options.now ?? Date.now;
  const entries = new Map<string, { value: V; at: number }>();
  return {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > options.ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      // Re-inserting moves the key to the end: a Map keeps insertion order,
      // so the first key is always the oldest.
      entries.delete(key);
      while (entries.size >= options.limit) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      entries.set(key, { value, at: now() });
    },
    delete(key) {
      entries.delete(key);
    },
    get size() {
      return entries.size;
    },
  };
}
