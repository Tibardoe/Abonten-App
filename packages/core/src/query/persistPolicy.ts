// Which cached server data the mobile app keeps on disk between launches,
// and how much of it. Framework-free on purpose: the rules are data and the
// selection is a pure function over the dehydrated cache, so both are unit
// tested here while the app only supplies storage and React Query plumbing.
//
// The model is an ALLOWLIST. A query is written to disk only when its key
// starts with one of the rule prefixes; anything else (payments, tickets,
// messages, comments, search results, organizer finance) stays in memory
// for the session and is gone after a restart. Each rule also caps:
//   * maxEntries — how many distinct queries of that kind survive, newest
//     data first (30 profiles you visited, not every profile ever seen);
//   * maxPages   — for infinite queries, how many pages are kept. A feed is
//     restored as its first page only; scrolling fetches the rest.

export type PersistRule = {
  /** Stable name, used for grouping and in logs. */
  id: string;
  /** Matches a query whose key starts with exactly these elements. */
  prefix: readonly unknown[];
  maxEntries: number;
  /** Infinite queries only: pages kept on disk (default: all). */
  maxPages?: number;
};

/** The subset of a dehydrated query this module reads or rewrites. */
export type PersistableQuery = {
  queryKey: readonly unknown[];
  state: {
    data?: unknown;
    dataUpdatedAt: number;
    status: string;
    error?: unknown;
  };
};

type InfiniteShape = { pages: unknown[]; pageParams: unknown[] };

function sameElement(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The first rule whose prefix the key starts with, or null. */
export function matchPersistRule(
  queryKey: readonly unknown[],
  rules: readonly PersistRule[],
): PersistRule | null {
  for (const rule of rules) {
    if (rule.prefix.length > queryKey.length) continue;
    let ok = true;
    for (let i = 0; i < rule.prefix.length; i += 1) {
      if (!sameElement(rule.prefix[i], queryKey[i])) {
        ok = false;
        break;
      }
    }
    if (ok) return rule;
  }
  return null;
}

export function isInfiniteData(data: unknown): data is InfiniteShape {
  const d = data as Partial<InfiniteShape> | null | undefined;
  return !!d && Array.isArray(d.pages) && Array.isArray(d.pageParams);
}

/** Keeps the first `maxPages` pages (and their params) of infinite data. */
export function trimInfiniteData<T>(data: T, maxPages: number | undefined): T {
  if (maxPages === undefined || !isInfiniteData(data)) return data;
  if (data.pages.length <= maxPages) return data;
  return {
    ...data,
    pages: data.pages.slice(0, maxPages),
    pageParams: data.pageParams.slice(0, maxPages),
  } as T;
}

/**
 * True for an `{ status, message }` API envelope that carries a failure
 * (HTTP-style status >= 400), or infinite data holding such a page. The
 * typed /api/mobile client returns failures as data rather than throwing,
 * so React Query calls them "success" — and one written to disk would be
 * restored on the next cold start in place of the real content it replaced.
 */
export function isErrorEnvelopeData(data: unknown): boolean {
  const isFailure = (value: unknown) => {
    const status = (value as { status?: unknown } | null | undefined)?.status;
    return typeof status === "number" && status >= 400;
  };
  if (isInfiniteData(data)) return data.pages.some(isFailure);
  return isFailure(data);
}

/**
 * The queries to write to disk: allowlisted queries holding real data, capped
 * per rule (most recently updated first), with infinite data trimmed.
 * Returns new objects for rewritten queries and never mutates the input.
 *
 * "Holding data" is the test, not "status is success": a query whose latest
 * REFRESH failed (offline, server down) keeps its last good data but has
 * status "error". Skipping those dropped exactly the content the cache exists
 * for — the next write, triggered by any other query, removed the inbox the
 * person had been reading, and the following cold start had nothing to
 * show. Such a query is written as the success it last was (its data and
 * the time that data was fetched), so it is restored as cached content that
 * is due for a refresh, not as a failure. An error envelope is never data.
 */
export function selectPersistedQueries<Q extends PersistableQuery>(
  queries: readonly Q[],
  rules: readonly PersistRule[],
): Q[] {
  const groups = new Map<string, { rule: PersistRule; items: Q[] }>();
  for (const query of queries) {
    if (query.state.data === undefined) continue;
    if (isErrorEnvelopeData(query.state.data)) continue;
    const rule = matchPersistRule(query.queryKey, rules);
    if (!rule) continue;
    let group = groups.get(rule.id);
    if (!group) {
      group = { rule, items: [] };
      groups.set(rule.id, group);
    }
    group.items.push(query);
  }

  const out: Q[] = [];
  for (const { rule, items } of groups.values()) {
    items.sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
    for (const query of items.slice(0, Math.max(0, rule.maxEntries))) {
      const data = trimInfiniteData(query.state.data, rule.maxPages);
      const failedRefresh = query.state.status !== "success";
      out.push(
        data === query.state.data && !failedRefresh
          ? query
          : {
              ...query,
              state: failedRefresh
                ? { ...query.state, data, status: "success", error: null }
                : { ...query.state, data },
            },
      );
    }
  }
  return out;
}
