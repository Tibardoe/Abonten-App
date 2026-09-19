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
 * The queries to write to disk: successful, allowlisted, capped per rule
 * (most recently updated first) and with infinite data trimmed. Returns new
 * objects for trimmed queries and never mutates the input.
 */
export function selectPersistedQueries<Q extends PersistableQuery>(
  queries: readonly Q[],
  rules: readonly PersistRule[],
): Q[] {
  const groups = new Map<string, { rule: PersistRule; items: Q[] }>();
  for (const query of queries) {
    if (query.state.status !== "success") continue;
    if (query.state.data === undefined) continue;
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
      out.push(
        data === query.state.data
          ? query
          : { ...query, state: { ...query.state, data } },
      );
    }
  }
  return out;
}
