import type {
  ContentComment,
  ContentCommentsPage,
} from "@abonten/types/contentType";

// Pure transforms over a cached, cursor-paginated comment list — the shape
// React Query's useInfiniteQuery holds for one post's top-level comments or
// one comment's replies. The app applies them to every cached list of a post
// (optimistic sends, likes, deletes, realtime events), so the comment sheet
// never needs to be reopened or refetched to show a change.
//
// Ordering (from the service): top-level comments newest first; replies
// oldest first. Every helper returns the SAME reference when nothing
// changed, so React Query notifies nobody for a list the change missed.

/** A comment as held on the device: a server row, or one still being sent. */
export type CachedComment = ContentComment & {
  /** Only on comments written here: `sending` until the server confirms. */
  localState?: "sending" | "failed";
  /** Links an optimistic row to the server row that replaces it. */
  clientId?: string;
};

export type CachedCommentsPage = Omit<ContentCommentsPage, "comments"> & {
  comments: CachedComment[];
};

export type CommentsCache = {
  pages: CachedCommentsPage[];
  pageParams: unknown[];
};

function sameComment(a: CachedComment, b: CachedComment): boolean {
  if (a.id === b.id) return true;
  return !!a.clientId && a.clientId === b.clientId;
}

function contains(cache: CommentsCache, c: CachedComment): boolean {
  return cache.pages.some((p) => p.comments.some((x) => sameComment(x, c)));
}

/** Newest-first list: puts the comment at the very top (no duplicates). */
export function prependComment(
  cache: CommentsCache | undefined,
  comment: CachedComment,
): CommentsCache | undefined {
  if (!cache || cache.pages.length === 0) return cache;
  if (contains(cache, comment)) return replaceComment(cache, comment, comment);
  const [first, ...rest] = cache.pages;
  return {
    ...cache,
    pages: [{ ...first, comments: [comment, ...first.comments] }, ...rest],
  };
}

/**
 * Oldest-first list (replies): adds the comment at the end, but only when
 * the end is loaded. With more pages still to fetch, the comment will arrive
 * in its place when the person scrolls there; adding it now would show it
 * twice (once here, once in the page that contains it).
 */
export function appendComment(
  cache: CommentsCache | undefined,
  comment: CachedComment,
): CommentsCache | undefined {
  if (!cache || cache.pages.length === 0) return cache;
  if (contains(cache, comment)) return replaceComment(cache, comment, comment);
  const lastIndex = cache.pages.length - 1;
  const last = cache.pages[lastIndex];
  if (last.hasNextPage) return cache;
  const pages = cache.pages.slice();
  pages[lastIndex] = { ...last, comments: [...last.comments, comment] };
  return { ...cache, pages };
}

/** Swaps the row matching `match` (by id or clientId) for `next`. */
export function replaceComment(
  cache: CommentsCache | undefined,
  match: Pick<CachedComment, "id" | "clientId">,
  next: CachedComment,
): CommentsCache | undefined {
  return mapComments(cache, (c) =>
    sameComment(c, match as CachedComment) ? next : c,
  );
}

export function patchComment(
  cache: CommentsCache | undefined,
  id: string,
  update: (c: CachedComment) => CachedComment,
): CommentsCache | undefined {
  return mapComments(cache, (c) => (c.id === id ? update(c) : c));
}

export function removeComment(
  cache: CommentsCache | undefined,
  match: Pick<CachedComment, "id" | "clientId">,
): CommentsCache | undefined {
  if (!cache) return cache;
  let hit = false;
  const pages = cache.pages.map((page) => {
    const comments = page.comments.filter(
      (c) => !sameComment(c, match as CachedComment),
    );
    if (comments.length === page.comments.length) return page;
    hit = true;
    return { ...page, comments };
  });
  return hit ? { ...cache, pages } : cache;
}

function mapComments(
  cache: CommentsCache | undefined,
  map: (c: CachedComment) => CachedComment,
): CommentsCache | undefined {
  if (!cache) return cache;
  let hit = false;
  const pages = cache.pages.map((page) => {
    let pageHit = false;
    const comments = page.comments.map((c) => {
      const next = map(c);
      if (next !== c) pageHit = true;
      return next;
    });
    if (!pageHit) return page;
    hit = true;
    return { ...page, comments };
  });
  return hit ? { ...cache, pages } : cache;
}

export function findComment(
  cache: CommentsCache | undefined | null,
  id: string,
): CachedComment | null {
  for (const page of cache?.pages ?? []) {
    const found = page.comments.find((c) => c.id === id);
    if (found) return found;
  }
  return null;
}

/**
 * Folds a freshly fetched FIRST page of a newest-first list into the cache
 * without disturbing what is already loaded:
 *   * comments not yet in the cache go on top, in server order;
 *   * comments already there take the server's counts (likes, replies) —
 *     except those in `keepCounts` (a like of ours still in flight, whose
 *     own response is the authority);
 *   * nothing is removed and the later pages' cursors stay valid.
 *
 * Returns `null` when the fresh page shares no comment with a non-empty
 * cache and has more after it: more arrived than one page holds, so there
 * is a gap, and the caller should reload the list instead.
 */
export function mergeFreshHead(
  cache: CommentsCache | undefined,
  fresh: ContentCommentsPage,
  keepCounts: ReadonlySet<string> = new Set(),
): CommentsCache | undefined | null {
  if (!cache || cache.pages.length === 0) return cache;
  const known = new Map<string, CachedComment>();
  for (const page of cache.pages) {
    for (const c of page.comments) known.set(c.id, c);
  }
  const hasServerRows = [...known.values()].some((c) => !c.localState);
  const overlap = fresh.comments.some((c) => known.has(c.id));
  if (hasServerRows && !overlap && fresh.hasNextPage) return null;

  const incoming = fresh.comments.filter((c) => !known.has(c.id));
  const freshById = new Map(fresh.comments.map((c) => [c.id, c]));

  let next = mapComments(cache, (c) => {
    const f = freshById.get(c.id);
    if (!f || keepCounts.has(c.id)) return c;
    if (f.likeCount === c.likeCount && f.replyCount === c.replyCount) return c;
    return { ...c, likeCount: f.likeCount, replyCount: f.replyCount };
  }) as CommentsCache;

  if (incoming.length > 0) {
    const [first, ...rest] = next.pages;
    // Rows still being sent stay above everything: they are the newest.
    const sending = first.comments.filter((c) => c.localState);
    const settled = first.comments.filter((c) => !c.localState);
    next = {
      ...next,
      pages: [
        { ...first, comments: [...sending, ...incoming, ...settled] },
        ...rest,
      ],
    };
  }
  return next;
}
