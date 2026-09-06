import { supabase } from "@/lib/supabase";
import { keysetOlderThan } from "@abonten/core/pagination";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

// Organizer-side event reviews + reply — native mirror of the web
// EventReviewsSection / respondToEventReview. `event_review` has
// event_review_organizer_select + event_review_organizer_update (scoped
// through the owning event's organizer_id), and a column-guard trigger, so
// the organizer reads the reviews and writes only `organizer_response` /
// `organizer_response_at` straight from the client — no /api/mobile route.

const PAGE = 15;
type Cursor = { sortValue: string; id: string } | null;

export type ManageEventReview = {
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
  event_review_photo:
    | { id: string; public_id: string; version: string; position: number }[]
    | null;
};

export function useEventReviewsManage(eventId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["organizer", "event-reviews", eventId],
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
      const rows = (data ?? []) as unknown as ManageEventReview[];
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

const MAX_RESPONSE_LENGTH = 500;

function invalidateEventReviewCaches(
  qc: ReturnType<typeof useQueryClient>,
  eventId: string | undefined,
) {
  qc.invalidateQueries({ queryKey: ["organizer", "event-reviews", eventId] });
  qc.invalidateQueries({ queryKey: ["mobile", "event-reviews", eventId] });
  qc.invalidateQueries({ queryKey: ["mobile", "event-rating", eventId] });
  qc.invalidateQueries({ queryKey: ["mobile", "event", eventId] });
}

// Create OR edit the organizer's reply. event_review has
// event_review_organizer_update (scoped through the owning event's
// organizer_id) + a column-guard trigger, so this direct client write is
// RLS-safe class-A CRUD (same as the reviewer's own edit path); no
// /api/mobile hop. The empty/length guard mirrors
// @abonten/services/reviews/reviewResponseCore.
export function useRespondToEventReview(eventId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reviewId: string; response: string }) => {
      const trimmed = input.response.trim();
      if (!trimmed) throw new Error("Write a reply before posting it.");
      if (trimmed.length > MAX_RESPONSE_LENGTH)
        throw new Error(
          `Keep your reply under ${MAX_RESPONSE_LENGTH} characters.`,
        );

      const { data: updated, error } = await supabase
        .from("event_review")
        .update({
          organizer_response: trimmed,
          organizer_response_at: new Date().toISOString(),
        })
        .eq("id", input.reviewId)
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0)
        throw new Error("Not authorized, or the review no longer exists.");
    },
    onSuccess: () => invalidateEventReviewCaches(qc, eventId),
  });
}

// Remove the organizer's reply (null both columns). Idempotent-ish: a
// no-rows result still means "not yours / gone".
export function useDeleteEventReviewResponse(eventId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reviewId: string) => {
      const { data: updated, error } = await supabase
        .from("event_review")
        .update({
          organizer_response: null,
          organizer_response_at: null,
        })
        .eq("id", reviewId)
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0)
        throw new Error("Not authorized, or the review no longer exists.");
    },
    onSuccess: () => invalidateEventReviewCaches(qc, eventId),
  });
}
