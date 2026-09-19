import type { ContentPostDocument } from "@abonten/types/contentType";

// One Spotlight can sit in many cached answers at once: a page of the feed,
// the post opened on its own, a creator's grid, the saved list, a Story
// sequence. A like, a new comment or a realtime count update must reach all
// of them, or the same post shows two different like counts depending on
// where you look — the reason engagement used to live in per-card state
// that other copies never saw.
//
// This walks any cached value, finds every post document with the given id
// and replaces it with `update(post)`, sharing structure everywhere else:
// containers that held no match are returned as the SAME reference, so React
// Query re-renders nothing that did not change.

function isPostDocument(value: unknown, postId: string): boolean {
  const v = value as Partial<ContentPostDocument> | null;
  return (
    !!v &&
    typeof v === "object" &&
    v.id === postId &&
    typeof v.counts === "object" &&
    v.counts !== null &&
    typeof v.viewer === "object" &&
    v.viewer !== null
  );
}

const MAX_DEPTH = 8;

export function patchPostDocuments<T>(
  data: T,
  postId: string,
  update: (post: ContentPostDocument) => ContentPostDocument,
): T {
  return walk(data, postId, update, 0) as T;
}

function walk(
  value: unknown,
  postId: string,
  update: (post: ContentPostDocument) => ContentPostDocument,
  depth: number,
): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") {
    return value;
  }
  if (isPostDocument(value, postId)) {
    return update(value as ContentPostDocument);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const out = walk(item, postId, update, depth + 1);
      if (out !== item) changed = true;
      return out;
    });
    return changed ? next : value;
  }
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const out = walk(item, postId, update, depth + 1);
    if (out !== item) changed = true;
    next[key] = out;
  }
  return changed ? next : value;
}

/** The first cached copy of a post found in `data`, if any. */
export function findPostDocument(
  data: unknown,
  postId: string,
  depth = 0,
): ContentPostDocument | null {
  if (depth > MAX_DEPTH || data === null || typeof data !== "object") {
    return null;
  }
  if (isPostDocument(data, postId)) return data as ContentPostDocument;
  const children = Array.isArray(data) ? data : Object.values(data);
  for (const child of children) {
    const found = findPostDocument(child, postId, depth + 1);
    if (found) return found;
  }
  return null;
}
