import { supabase } from "@/lib/supabase";
import { withInlineEventAvailability } from "@abonten/core/eventAvailability";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { useQuery } from "@tanstack/react-query";

// Native echo of the web place-detail extras:
// - getPlaceUpcomingEvents -> usePlaceUpcomingEvents
// - "Similar places"       -> useSimilarPlaces
// (A place's reviews are @/features/reviews/useReviews.)
//
// get_place_events lists the events at a place that are still on, soonest
// first, by the rule every event list uses: an event with several dates and
// one that has already begun are listed too (a plain read of `event` asking
// for a start in the future missed both). The row is the whole card.

export function usePlaceUpcomingEvents(placeId: string | undefined) {
  return useQuery({
    queryKey: ["mobile", "place-upcoming-events", placeId],
    enabled: !!placeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_place_events", {
        p_place_id: placeId as string,
        p_limit: 12,
      });
      if (error) throw error;
      // Same RPC-to-app-model boundary as the other discovery hooks.
      return (data ?? []).map((row) =>
        withInlineEventAvailability(row),
      ) as unknown as UserPostType[];
    },
  });
}

// 10 km — matches web's SIMILAR_PLACES_RADIUS_KM.
const SIMILAR_RADIUS_KM = 10;
const SIMILAR_LIMIT = 6;

/**
 * The nearest places of the same category, asked for as that. (It used to
 * be "the 20 nearest places of any kind, then keep this category", which in
 * a busy street found none.)
 */
export function useSimilarPlaces(
  placeId: string | undefined,
  categoryId: number | null | undefined,
  coords: { lat: number; lng: number } | null | undefined,
) {
  return useQuery({
    queryKey: [
      "mobile",
      "similar-places",
      placeId,
      categoryId,
      coords?.lat,
      coords?.lng,
    ],
    enabled: !!placeId && categoryId != null && !!coords,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_filtered_places", {
        p_category_id: categoryId as number,
        p_user_lat: coords?.lat,
        p_user_lng: coords?.lng,
        p_max_distance_km: SIMILAR_RADIUS_KM,
        // One more than shown: the place is its own nearest.
        p_page_size: SIMILAR_LIMIT + 1,
      });
      if (error) throw error;
      return ((data ?? []) as PlaceType[])
        .filter((p) => p.id !== placeId)
        .slice(0, SIMILAR_LIMIT);
    },
  });
}
