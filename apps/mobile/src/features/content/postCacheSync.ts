import {
  findPostDocument,
  patchPostDocuments,
} from "@abonten/core/content/postCache";
import type {
  ContentCounts,
  ContentPostDocument,
} from "@abonten/types/contentType";
import type { QueryClient } from "@tanstack/react-query";
import { CONTENT_KEY } from "./useContentProgram";

// Every cached copy of a post is patched at once (feed pages, the opened
// post, grids, saved lists, Story sequences), so a like or a comment count
// reads the same wherever that post is on screen. The walk and the
// structural sharing live in @abonten/core/content/postCache.

export function patchPostEverywhere(
  qc: QueryClient,
  postId: string,
  update: (post: ContentPostDocument) => ContentPostDocument,
): void {
  qc.setQueriesData({ queryKey: CONTENT_KEY }, (old: unknown) => {
    if (old === undefined) return undefined;
    const next = patchPostDocuments(old, postId, update);
    // Undefined = "no change": the query is not touched, nothing re-renders
    // and nothing is re-written to the offline cache.
    return next === old ? undefined : next;
  });
}

export function patchPostCounts(
  qc: QueryClient,
  postId: string,
  update: (counts: ContentCounts) => Partial<ContentCounts>,
): void {
  patchPostEverywhere(qc, postId, (p) => ({
    ...p,
    counts: { ...p.counts, ...update(p.counts) },
  }));
}

/** The post as currently cached (any copy), for rollbacks and baselines. */
export function readCachedPost(
  qc: QueryClient,
  postId: string,
): ContentPostDocument | null {
  for (const [, data] of qc.getQueriesData({ queryKey: CONTENT_KEY })) {
    const found = findPostDocument(data, postId);
    if (found) return found;
  }
  return null;
}

/**
 * A cached copy of the post plus when that copy was fetched — to seed a
 * post screen opened from a feed, grid or Story that already has it, so it
 * renders at once (and offline) and refreshes in the background by age.
 */
export function readCachedPostWithTime(
  qc: QueryClient,
  postId: string,
): { post: ContentPostDocument; updatedAt: number } | null {
  for (const query of qc.getQueryCache().findAll({ queryKey: CONTENT_KEY })) {
    const found = findPostDocument(query.state.data, postId);
    if (found) return { post: found, updatedAt: query.state.dataUpdatedAt };
  }
  return null;
}
