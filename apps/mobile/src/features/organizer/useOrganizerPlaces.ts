import { api } from "@/lib/api";
import type { OrganizerPlaceRow } from "@abonten/api-client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

// The owner's "My places" list + one place's Insights — mirrors the web
// /manage/places list and ManagePlaceInsightsSection.

const KEY = ["mobile", "organizer", "places"] as const;

export function useOrganizerPlaces() {
  return useInfiniteQuery({
    queryKey: KEY,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.organizer.places({ cursor: pageParam, pageSize: 20 }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });
}

export function flattenOrganizerPlaces(
  pages: { data: OrganizerPlaceRow[] }[] | undefined,
): OrganizerPlaceRow[] {
  return pages?.flatMap((p) => p.data) ?? [];
}

export function usePlaceInsights(placeId: string) {
  return useQuery({
    queryKey: [...KEY, placeId, "insights"],
    queryFn: () => api.organizer.placeInsights(placeId),
    enabled: !!placeId,
    staleTime: 20_000,
  });
}
