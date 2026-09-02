import { api } from "@/lib/api";
import type {
  BookingStatus,
  OwnerPlaceBooking,
  OwnerPlaceReviewRow,
  RespondToPlaceBookingBody,
} from "@abonten/api-client";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

// Per-place Bookings + Reviews — the native mirror of the web
// ManagePlaceBookingsSection / ManagePlaceReviewsSection (the Bookings and
// Reviews tabs of ManagePlaceView). Bookings are cursor-paginated and
// filtered by status; reviews are the approved list with an owner reply.

const BOOKINGS_KEY = ["mobile", "organizer", "place-bookings"] as const;
const REVIEWS_KEY = ["mobile", "organizer", "place-reviews"] as const;

// "all" maps to no `status` param — the unfiltered view.
export type BookingFilter = BookingStatus | "all";

export function usePlaceBookings(placeId: string, filter: BookingFilter) {
  return useInfiniteQuery({
    queryKey: [...BOOKINGS_KEY, placeId, filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.organizer.placeBookings(placeId, {
        status: filter === "all" ? undefined : filter,
        cursor: pageParam,
        pageSize: 20,
      }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    enabled: !!placeId,
  });
}

export function flattenBookings(
  pages: { data: OwnerPlaceBooking[] }[] | undefined,
): OwnerPlaceBooking[] {
  return pages?.flatMap((p) => p.data) ?? [];
}

export function useRespondToPlaceBooking(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RespondToPlaceBookingBody) =>
      api.organizer.respondToPlaceBooking(placeId, body),
    onSuccess: () => {
      // Every status filter's list can be affected (a pending row leaves
      // "Pending" and joins "Accepted"/"Declined"), so drop them all.
      qc.invalidateQueries({ queryKey: [...BOOKINGS_KEY, placeId] });
      qc.invalidateQueries({
        queryKey: ["mobile", "organizer", "places", placeId, "insights"],
      });
    },
  });
}

export function usePlaceReviews(placeId: string) {
  return useInfiniteQuery({
    queryKey: [...REVIEWS_KEY, placeId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.organizer.placeReviews(placeId, { cursor: pageParam, pageSize: 20 }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    enabled: !!placeId,
  });
}

export function flattenReviews(
  pages: { data: OwnerPlaceReviewRow[] }[] | undefined,
): OwnerPlaceReviewRow[] {
  return pages?.flatMap((p) => p.data) ?? [];
}

export function useRespondToPlaceReview(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { reviewId: string; response: string }) =>
      api.organizer.respondToPlaceReview(placeId, v),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...REVIEWS_KEY, placeId] }),
  });
}
