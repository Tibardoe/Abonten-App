import { supabase } from "@/lib/supabase";
import { keysetOlderThan } from "@abonten/core/pagination";
import type { UserPostType } from "@abonten/types/postsType";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

function cheapest(
  tickets: { price: number | null; currency: string | null }[],
): { min_price: number | null; currency: string | null } {
  const priced = tickets.filter(
    (t): t is { price: number; currency: string | null } => t.price != null,
  );
  if (priced.length === 0) return { min_price: null, currency: null };
  const low = priced.reduce((m, t) => (t.price < m.price ? t : m));
  return { min_price: low.price, currency: low.currency };
}

// Native echoes of the web place-detail extras:
// - getPlaceReviews  -> usePlaceReviewsList
// - getPlaceUpcomingEvents -> usePlaceUpcomingEvents
// `place_review` is anon-readable where status='approved'
// (place_review_public_select); `event` is anon-readable where
// status='published'.

const REVIEWS_PAGE = 8;

export type PlaceReviewItem = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  created_at: string;
  owner_response: string | null;
  reviewer: {
    username: string | null;
    avatar_public_id: string | null;
    avatar_version: string | null;
  } | null;
  place_review_photo?:
    | { id: string; public_id: string; version: string; position: number }[]
    | null;
};

type Cursor = { sortValue: string; id: string } | null;

export function usePlaceReviewsList(placeId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["mobile", "place-reviews", placeId],
    enabled: !!placeId,
    initialPageParam: null as Cursor,
    getNextPageParam: (last: { nextCursor: Cursor }) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("place_review")
        .select(
          "id, rating, title, comment, created_at, owner_response, reviewer:reviewer_id(username, avatar_public_id, avatar_version), place_review_photo(id, public_id, version, position)",
        )
        .eq("place_id", placeId as string)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(REVIEWS_PAGE + 1);
      if (pageParam) q = q.or(keysetOlderThan("created_at", "id", pageParam));
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as PlaceReviewItem[];
      const hasNext = rows.length > REVIEWS_PAGE;
      const page = hasNext ? rows.slice(0, REVIEWS_PAGE) : rows;
      const lastRow = page[page.length - 1];
      return {
        reviews: page,
        nextCursor:
          hasNext && lastRow
            ? { sortValue: lastRow.created_at, id: lastRow.id }
            : null,
      };
    },
  });
}

export function usePlaceUpcomingEvents(placeId: string | undefined) {
  return useQuery({
    queryKey: ["mobile", "place-upcoming-events", placeId],
    enabled: !!placeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event")
        .select(
          "*, ticket_type(id, type, price, currency), occurrences:event_occurrence(*)",
        )
        .eq("place_id", placeId as string)
        .eq("status", "published")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(12);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((e) => {
        const { min_price, currency } = cheapest(
          (e.ticket_type ?? []) as {
            price: number | null;
            currency: string | null;
          }[],
        );
        return { ...e, min_price, currency } as unknown as UserPostType;
      });
    },
  });
}
