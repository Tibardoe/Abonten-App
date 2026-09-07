import { supabase } from "@/lib/supabase";
import { keysetOlderThan } from "@abonten/core/pagination";
import { parseRatingAggregate, roundRating } from "@abonten/core/ratings";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ReviewPhotoRow } from "./useEventReviews";

// The public reviews for one event — native echo of the web
// getEventReviews / getEventRating. `event_review` is anon-readable where
// status='approved' (event_review_public_select), so both reads run
// straight from the client.

const PAGE = 8;

export type EventReviewListItem = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  created_at: string;
  is_verified_attendee: boolean;
  organizer_response: string | null;
  reviewer: {
    username: string | null;
    avatar_public_id: string | null;
    avatar_version: string | null;
  } | null;
  event_review_photo?: ReviewPhotoRow[] | null;
};

type Cursor = { sortValue: string; id: string } | null;

export function useEventRating(eventId: string | undefined) {
  return useQuery({
    queryKey: ["mobile", "event-rating", eventId],
    enabled: !!eventId,
    staleTime: 60_000,
    queryFn: async () => {
      // Aggregated in Postgres (get_event_rating) rather than pulling every
      // approved review row onto the device to average two numbers. Called
      // directly rather than through @abonten/services, which apps/mobile
      // must not import -- the RPC is SECURITY INVOKER and granted to anon +
      // authenticated, so this is the same RLS-safe read the raw table
      // select here used to be.
      const { data, error } = await supabase
        .rpc("get_event_rating", { p_event_id: eventId as string })
        .maybeSingle();
      if (error) throw error;
      const { average, count } = parseRatingAggregate(data);
      return { average: roundRating(average), count };
    },
  });
}

export function useEventReviewsList(eventId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["mobile", "event-reviews", eventId],
    enabled: !!eventId,
    initialPageParam: null as Cursor,
    getNextPageParam: (last: { nextCursor: Cursor }) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("event_review")
        .select(
          "id, rating, title, comment, created_at, is_verified_attendee, organizer_response, reviewer:reviewer_id(username, avatar_public_id, avatar_version), event_review_photo(id, public_id, version, position)",
        )
        .eq("event_id", eventId as string)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE + 1);
      if (pageParam) q = q.or(keysetOlderThan("created_at", "id", pageParam));
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as EventReviewListItem[];
      const hasNext = rows.length > PAGE;
      const page = hasNext ? rows.slice(0, PAGE) : rows;
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
