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
