"use client";

import { getContentFeed } from "@/actions/content/getContentFeed";
import type {
  ContentFeedItem,
  ContentFeedPage,
  ContentFeedSurface,
} from "@abonten/types/contentType";
import { useInfiniteQuery } from "@tanstack/react-query";
import { dataOf, messageOf } from "../lib/result";
import { getViewerKey } from "../lib/viewerKey";

export type FeedCoords = { lat: number; lng: number } | null;

/** One Spotlight surface as an infinite list. */
export function useContentFeed(
  surface: ContentFeedSurface,
  coords: FeedCoords,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: [
      "content",
      "feed",
      surface,
      coords ? `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}` : null,
    ],
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<ContentFeedPage> => {
      const res = await getContentFeed({
        surface,
        cursor: pageParam ?? undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        viewerKey: getViewerKey(),
      });
      const data = dataOf(res);
      if (!data) throw new Error(messageOf(res));
      return data;
    },
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    staleTime: 60_000,
  });
}

/** Flattens pages and drops a post that a later page repeats. */
export function flattenFeed(
  pages: ContentFeedPage[] | undefined,
): ContentFeedItem[] {
  const seen = new Set<string>();
  const out: ContentFeedItem[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.post.id)) continue;
      seen.add(item.post.id);
      out.push(item);
    }
  }
  return out;
}
