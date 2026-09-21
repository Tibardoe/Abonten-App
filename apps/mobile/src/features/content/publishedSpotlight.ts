import { prependOwnPost } from "@abonten/core/content/feedMerge";
import type {
  ContentFeedPage,
  ContentPostDocument,
} from "@abonten/types/contentType";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { CONTENT_KEY } from "./useContentProgram";

// What happens to the feed when someone publishes a Spotlight.
//
// The feed is deliberately never refetched behind the viewer (a re-rank
// moves the video they are on — see useContentFeed), which is why a new
// post used to appear only after a manual refresh. Instead the post the
// server just returned is written into the cached For You feed, first,
// exactly once (prependOwnPost), and the Spotlight screen is asked to open
// on it the next time it is focused. Nothing is faked: this runs only after
// the create call succeeded, with the server's own document, and only for a
// post that is actually live (a draft never enters a feed).

let pendingFocus: string | null = null;

export function showPublishedSpotlight(
  qc: QueryClient,
  userId: string | null,
  post: ContentPostDocument,
): void {
  if (post.kind !== "spotlight" || post.status !== "published") return;
  qc.setQueriesData<InfiniteData<ContentFeedPage, string | null>>(
    {
      predicate: (q) =>
        q.queryKey[0] === CONTENT_KEY[0] &&
        q.queryKey[1] === CONTENT_KEY[1] &&
        q.queryKey[2] === "feed" &&
        q.queryKey[3] === userId &&
        q.queryKey[4] === "for_you",
    },
    (old) => prependOwnPost(old, post),
  );
  pendingFocus = post.id;
}

/** The post the Spotlight screen should open on, once (then cleared). */
export function takeSpotlightFocus(): string | null {
  const id = pendingFocus;
  pendingFocus = null;
  return id;
}
