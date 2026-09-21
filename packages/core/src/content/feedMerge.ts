import type {
  ContentFeedItem,
  ContentPostDocument,
} from "@abonten/types/contentType";

// Merges paid placements into an organic page so the feed never becomes an
// advertisement wall: at most `maxShareBps` of a page is sponsored, with at
// least `minGap` organic posts before the first and between any two, and a
// sponsored post never duplicates an organic one on the same page.
// Deterministic: the same inputs always give the same order.

export type SponsoredCandidate = {
  campaignId: string;
  post: ContentPostDocument;
};

export function mergeSponsored(
  organic: ContentPostDocument[],
  sponsored: SponsoredCandidate[],
  options: { maxShareBps: number; minGap: number },
): ContentFeedItem[] {
  const items: ContentFeedItem[] = organic.map((post) => ({
    post,
    sponsored: null,
  }));
  if (organic.length === 0 || sponsored.length === 0) return items;

  const organicIds = new Set(organic.map((p) => p.id));
  const usable = sponsored.filter((s) => !organicIds.has(s.post.id));
  if (usable.length === 0) return items;

  const gap = Math.max(1, options.minGap);
  // Share applies to the merged page: sponsored / (organic + sponsored).
  const share = Math.max(0, Math.min(options.maxShareBps, 10_000)) / 10_000;
  const maxSponsored =
    share <= 0 || share >= 1
      ? 0
      : Math.floor((organic.length * share) / (1 - share));
  const allowed = Math.min(
    maxSponsored,
    usable.length,
    Math.floor(organic.length / gap),
  );
  if (allowed <= 0) return items;

  const out: ContentFeedItem[] = [];
  let placed = 0;
  let sinceLast = 0;
  for (const item of items) {
    out.push(item);
    sinceLast += 1;
    if (placed < allowed && sinceLast >= gap) {
      const next = usable[placed];
      out.push({
        post: next.post,
        sponsored: { campaignId: next.campaignId },
      });
      placed += 1;
      sinceLast = 0;
    }
  }
  return out;
}

type FeedPages = {
  pages: { items: ContentFeedItem[] }[];
  pageParams: unknown[];
};

/**
 * A feed with the person's own just-published post at the top of its first
 * page — so it is there when they return to the feed, without a refetch
 * (which would re-rank everything under them). Any other copy of the post
 * (a retried publish, a refresh that already brought it) is removed, so it
 * appears exactly once. Returns the input unchanged when there is no page
 * to put it on.
 */
export function prependOwnPost<T extends FeedPages>(
  feed: T | undefined,
  post: ContentPostDocument,
): T | undefined {
  if (!feed || feed.pages.length === 0) return feed;
  const pages = feed.pages.map((page, i) => {
    const rest = page.items.filter((item) => item.post.id !== post.id);
    return i === 0
      ? { ...page, items: [{ post, sponsored: null }, ...rest] }
      : rest.length === page.items.length
        ? page
        : { ...page, items: rest };
  });
  return { ...feed, pages };
}
