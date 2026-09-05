import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import {
  evaluateEventReviewEligibility,
  isEventAwaitingReview,
} from "@abonten/core/eventReviewEligibility";
import { keysetOlderThan } from "@abonten/core/pagination";
import { MAX_REVIEW_PHOTOS } from "@abonten/core/uploadLimits";
import type { Occurrence } from "@abonten/types/occurrenceType";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

// Native echoes of the web event-review actions
// (getEventReviewEligibility / getEventsAwaitingReview / postEventReview /
// getUserEventReviews). `event_review` and `ticket` both have owner-scoped
// RLS (event_review_reviewer_*, ticket_owner_select), so the whole flow
// runs straight from the client — no /api/mobile endpoint needed. Every
// rule the web server actions enforce is re-checked here, and the DB's
// UNIQUE(event_id, reviewer_id) is the final backstop.

const PAGE_SIZE = 20;

// Native echo of insertReviewPhotos.ts: once the review row exists (so its id
// is known and its reviewer_id is guaranteed to be the caller), attach the
// caller's already-uploaded photos. A publicId outside the caller's own
// signed folder means tampered metadata — silently dropped, since the review
// itself already saved. Anything past MAX_REVIEW_PHOTOS is dropped too.
export type ReviewPhotoInput = { publicId: string; version: string };

export type ReviewPhotoRow = {
  id: string;
  public_id: string;
  version: string;
  position: number;
};

async function attachEventReviewPhotos(
  userId: string,
  reviewId: string,
  photos: ReviewPhotoInput[] | undefined,
): Promise<void> {
  if (!photos?.length) return;
  const prefix = `event_review_photos/${userId}/`;
  const rows = photos
    .filter((p) => p.publicId.startsWith(prefix))
    .slice(0, MAX_REVIEW_PHOTOS)
    .map((p, index) => ({
      event_review_id: reviewId,
      public_id: p.publicId,
      version: p.version,
      position: index,
    }));
  if (!rows.length) return;
  await supabase.from("event_review_photo").insert(rows);
}

export type EventForReview = {
  id: string;
  organizer_id: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  event_occurrence?: { id: string; starts_at: string; ends_at: string }[];
};

export type OwnEventReview = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  event_review_photo?: ReviewPhotoRow[] | null;
};

export type EventReviewEligibility =
  | {
      canReview: false;
      reason:
        | "signed_out"
        | "organizer"
        | "cancelled"
        | "not_ended"
        | "not_attended";
    }
  | { canReview: false; reason: "has_review"; ownReview: OwnEventReview }
  | { canReview: true };

type UsedTicketRow = { ticket_type: { event_id: string } | null };

async function hasCheckedInTicket(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("ticket")
    .select("ticket_type:ticket_type_id(event_id)")
    .eq("user_id", userId)
    .eq("status", "used");
  return ((data ?? []) as unknown as UsedTicketRow[]).some(
    (t) => t.ticket_type?.event_id === eventId,
  );
}

async function computeEligibility(
  userId: string | undefined,
  event: EventForReview,
): Promise<EventReviewEligibility> {
  if (!userId) return { canReview: false, reason: "signed_out" };
  if (userId === event.organizer_id)
    return { canReview: false, reason: "organizer" };

  const { data: own } = await supabase
    .from("event_review")
    .select(
      "id, rating, title, comment, event_review_photo(id, public_id, version, position)",
    )
    .eq("event_id", event.id)
    .eq("reviewer_id", userId)
    .maybeSingle();

  if (own) {
    return {
      canReview: false,
      reason: "has_review",
      ownReview: own as OwnEventReview,
    };
  }

  // Only the attendance query is worth deferring past the cheap date/status
  // checks; the shared decider is fed a placeholder for it first, then the
  // real value once it's the last gate standing.
  const preAttendance = evaluateEventReviewEligibility({
    viewerUserId: userId,
    organizerId: event.organizer_id,
    eventStatus: event.status,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    occurrences: (event.event_occurrence as Occurrence[] | undefined) ?? null,
    hasOwnReview: false,
    hasVerifiedAttendance: true,
  });
  // `hasOwnReview: false` above means the decider can only return a reason
  // other than "has_review" here — narrow to this file's local type.
  if (!preAttendance.canReview) {
    return {
      canReview: false,
      reason: preAttendance.reason as Exclude<
        typeof preAttendance.reason,
        "has_review"
      >,
    };
  }

  if (!(await hasCheckedInTicket(userId, event.id)))
    return { canReview: false, reason: "not_attended" };

  return { canReview: true };
}

export function useEventReviewEligibility(event: EventForReview | undefined) {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["reviews", "eligibility", event?.id, userId],
    enabled: !!event,
    queryFn: () => computeEligibility(userId, event as EventForReview),
  });
}

export type EventAwaitingReview = {
  id: string;
  title: string;
  event_code: string;
  flyer_public_id: string;
  flyer_version: string;
};

async function fetchEventsAwaitingReview(
  userId: string,
): Promise<EventAwaitingReview[]> {
  const { data: usedTickets } = await supabase
    .from("ticket")
    .select("ticket_type:ticket_type_id(event_id)")
    .eq("user_id", userId)
    .eq("status", "used");

  const eventIds = [
    ...new Set(
      ((usedTickets ?? []) as unknown as UsedTicketRow[])
        .map((t) => t.ticket_type?.event_id)
        .filter((id): id is string => !!id),
    ),
  ];
  if (eventIds.length === 0) return [];

  const { data: reviewed } = await supabase
    .from("event_review")
    .select("event_id")
    .eq("reviewer_id", userId)
    .in("event_id", eventIds);
  const reviewedIds = new Set(
    ((reviewed ?? []) as { event_id: string }[]).map((r) => r.event_id),
  );
  const unreviewed = eventIds.filter((id) => !reviewedIds.has(id));
  if (unreviewed.length === 0) return [];

  const { data: events } = await supabase
    .from("event")
    .select(
      "id, title, event_code, flyer_public_id, flyer_version, status, starts_at, ends_at, event_occurrence(id, starts_at, ends_at)",
    )
    .in("id", unreviewed);

  const now = new Date();
  type Row = EventAwaitingReview & {
    status: string;
    starts_at: string | null;
    ends_at: string | null;
    event_occurrence: Occurrence[] | null;
  };
  return ((events ?? []) as unknown as Row[])
    .filter((e) =>
      isEventAwaitingReview(
        e.status,
        e.starts_at,
        e.ends_at,
        e.event_occurrence,
        now,
      ),
    )
    .map((e) => ({
      id: e.id,
      title: e.title,
      event_code: e.event_code,
      flyer_public_id: e.flyer_public_id,
      flyer_version: e.flyer_version,
    }));
}

export function useEventsAwaitingReview() {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["reviews", "awaiting", userId],
    enabled: !!userId,
    queryFn: () => fetchEventsAwaitingReview(userId as string),
  });
}

export type UserEventReview = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  created_at: string;
  is_verified_attendee: boolean;
  event_review_photo?: ReviewPhotoRow[] | null;
  event: {
    id: string;
    title: string;
    event_code: string;
    flyer_public_id: string;
    flyer_version: string;
  } | null;
};

export function useUserEventReviews() {
  const { session } = useSession();
  const userId = session?.user.id;
  type Cursor = { sortValue: string; id: string };

  return useInfiniteQuery({
    queryKey: ["reviews", "mine", userId],
    enabled: !!userId,
    initialPageParam: null as Cursor | null,
    getNextPageParam: (last: { nextCursor: Cursor | null }) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("event_review")
        .select(
          "id, rating, title, comment, created_at, is_verified_attendee, event_review_photo(id, public_id, version, position), event:event_id(id, title, event_code, flyer_public_id, flyer_version)",
        )
        .eq("reviewer_id", userId ?? "")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE + 1);
      if (pageParam) {
        query = query.or(keysetOlderThan("created_at", "id", pageParam));
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as UserEventReview[];
      const hasNext = rows.length > PAGE_SIZE;
      const page = hasNext ? rows.slice(0, PAGE_SIZE) : rows;
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

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function usePostEventReview() {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (input: {
      eventId: string;
      rating: number;
      title?: string;
      comment?: string;
      photos?: ReviewPhotoInput[];
    }) => {
      if (!userId) throw new Error("Not signed in");
      const { data: review, error } = await supabase
        .from("event_review")
        .insert({
          event_id: input.eventId,
          reviewer_id: userId,
          rating: input.rating,
          title: input.title ? titleCase(input.title) : null,
          comment: input.comment?.trim() ? input.comment.trim() : null,
          status: "approved",
          is_verified_attendee: true,
        })
        .select("id")
        .single();
      if (error) {
        // 23505 = unique_violation on UNIQUE(event_id, reviewer_id).
        if (error.code === "23505")
          throw new Error("You've already reviewed this event.");
        throw error;
      }
      // The review itself is saved; a photo-attach failure never fails it
      // (mirrors insertReviewPhotos.ts).
      await attachEventReviewPhotos(userId, review.id, input.photos);
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["reviews", "awaiting", userId] });
      qc.invalidateQueries({ queryKey: ["reviews", "mine", userId] });
      qc.invalidateQueries({
        queryKey: ["reviews", "eligibility", input.eventId, userId],
      });
      qc.invalidateQueries({ queryKey: ["mobile", "event", input.eventId] });
      // The event detail screen's own rating line + reviews list
      // (useEventRating / useEventReviewsList) are separate query keys from
      // ["mobile","event",...] -- without this a review posted from that
      // exact screen leaves its own rating/list stale until it's
      // unmounted and remounted.
      qc.invalidateQueries({
        queryKey: ["mobile", "event-rating", input.eventId],
      });
      qc.invalidateQueries({
        queryKey: ["mobile", "event-reviews", input.eventId],
      });
      // EventCard on the "All events" list (get_filtered_events) shows a live
      // avg_rating — a new review moves it.
      qc.invalidateQueries({ queryKey: ["explore"] });
      qc.invalidateQueries({ queryKey: ["discovery"] });
    },
  });
}

export function useDeleteEventReview() {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await supabase
        .from("event_review")
        .delete()
        .eq("id", reviewId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", "awaiting", userId] });
      qc.invalidateQueries({ queryKey: ["reviews", "mine", userId] });
      qc.invalidateQueries({ queryKey: ["reviews", "eligibility"] });
      // Unscoped (no eventId) since this mutation only has the review id --
      // matches every cached event-rating/event-reviews query, same
      // reasoning as usePostEventReview above.
      qc.invalidateQueries({ queryKey: ["mobile", "event-rating"] });
      qc.invalidateQueries({ queryKey: ["mobile", "event-reviews"] });
      qc.invalidateQueries({ queryKey: ["explore"] });
      qc.invalidateQueries({ queryKey: ["discovery"] });
    },
  });
}
