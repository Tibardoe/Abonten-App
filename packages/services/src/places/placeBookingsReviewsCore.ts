import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type {
  BookingStatus,
  OwnerPlaceBooking,
} from "@abonten/types/placeBookingType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationCore } from "../notifications/createNotification";

// Post-auth bodies of getPlaceBookings / respondToPlaceBooking /
// getPlaceReviews (owner Reviews tab) / respondToPlaceReview, lifted so the
// mobile per-place Bookings + Reviews screens run the same logic. NOT a
// "use server" file — every function takes an already-resolved
// SupabaseClient + userId.

// ---- Bookings -------------------------------------------------------

/**
 * Owner-only, cursor-paginated list of a place's booking requests. Lifted
 * from getPlaceBookings.ts (ownership check, then keyset pagination on
 * created_at/id), joined to the customer's username and the requested
 * service's name. `status` is optional so the owner's Bookings tab can also
 * show an unfiltered "All" view.
 */
export async function fetchPlaceBookingsPage(
  supabase: SupabaseClient,
  userId: string,
  placeId: string,
  options?: {
    status?: BookingStatus;
    cursor?: string | null;
    pageSize?: number;
  },
): Promise<PaginatedResult<OwnerPlaceBooking>> {
  const { data: place, error: placeError } = await supabase
    .from("place")
    .select("owner_id")
    .eq("id", placeId)
    .maybeSingle();

  if (placeError) {
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: `Error fetching place: ${placeError.message}`,
    };
  }

  if (!place) {
    return {
      status: 404,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Place not found",
    };
  }

  if (place.owner_id !== userId) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Not authorized to view this place's bookings",
    };
  }

  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  let query = supabase
    .from("place_booking")
    .select("*, user_info!customer_id(username), place_service(name)")
    .eq("place_id", placeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data, error } = await query;

  if (error) {
    logger.error(`Failed fetching place bookings: ${error.message}`);

    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  const { page, hasNextPage } = splitPage<OwnerPlaceBooking>(
    (data ?? []) as unknown as OwnerPlaceBooking[],
    pageSize,
  );

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}

export type RespondToPlaceBookingCoreResult = {
  status: 200 | 401 | 403 | 404 | 409 | 500;
  message: string;
};

/**
 * Owner-only accept/decline of a pending booking request. Lifted from
 * respondToPlaceBooking.ts: ownership through the owning place, the
 * `.eq("status", "pending")` race guard on the update, and the customer
 * notification either way.
 */
export async function respondToPlaceBookingCore(
  supabase: SupabaseClient,
  userId: string,
  bookingId: string,
  decision: "accept" | "decline",
): Promise<RespondToPlaceBookingCoreResult> {
  const { data: booking, error: fetchError } = await supabase
    .from("place_booking")
    .select("id, status, customer_id, place:place_id(owner_id, name, slug)")
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchError) {
    return {
      status: 500,
      message: `Error fetching booking: ${fetchError.message}`,
    };
  }

  if (!booking) {
    return { status: 404, message: "Booking not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST's embedded-resource shape isn't worth a dedicated type for this one ownership check; no generated Supabase types exist in this repo (see PROJECT.md)
  const place = (booking as any).place;

  if (place?.owner_id !== userId) {
    return {
      status: 403,
      message: "Not authorized to respond to this booking",
    };
  }

  if (booking.status !== "pending") {
    return {
      status: 409,
      message: "This booking has already been responded to.",
    };
  }

  const newStatus = decision === "accept" ? "accepted" : "declined";

  const { data: updatedRows, error: updateError } = await supabase
    .from("place_booking")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "pending")
    .select("id");

  if (updateError) {
    logger.error(`Error responding to booking: ${updateError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return {
      status: 409,
      message: "This booking has already been responded to.",
    };
  }

  const placeName = place?.name ?? "the place";

  const notifyResult = await createNotificationCore(supabase, {
    userId: booking.customer_id,
    type: `place_booking_${newStatus}`,
    title:
      newStatus === "accepted"
        ? "Your booking was accepted"
        : "Your booking was declined",
    body:
      newStatus === "accepted"
        ? `Your booking request for ${placeName} was accepted.`
        : `Your booking request for ${placeName} was declined.`,
    link: place?.slug ? `/places/${place.slug}` : null,
  });

  if (notifyResult.status !== 200) {
    logger.error(
      `Failed to notify customer of booking response: ${notifyResult.message}`,
    );
  }

  return {
    status: 200,
    message:
      newStatus === "accepted" ? "Booking accepted." : "Booking declined.",
  };
}

// ---- Reviews (owner Reviews tab) -----------------------------------

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md) — matches getPlaceReviews.ts's own biome-ignore'd `any` return type for this joined row
export type OwnerPlaceReviewsResult = PaginatedResult<any>;

/**
 * Owner-only, cursor-paginated list of a place's approved reviews — the
 * same query getPlaceReviews.ts runs for the public detail page, but gated
 * to the place's owner first (the mobile route can't rely on a page-level
 * ownership gate the way the web ManagePlaceView does). Approved-only, same
 * as the web owner Reviews tab.
 */
export async function fetchPlaceReviewsForOwner(
  supabase: SupabaseClient,
  userId: string,
  placeId: string,
  options?: { cursor?: string | null; pageSize?: number },
): Promise<OwnerPlaceReviewsResult> {
  const { data: place, error: placeError } = await supabase
    .from("place")
    .select("owner_id")
    .eq("id", placeId)
    .maybeSingle();

  if (placeError) {
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: `Error fetching place: ${placeError.message}`,
    };
  }

  if (!place) {
    return {
      status: 404,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Place not found",
    };
  }

  if (place.owner_id !== userId) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Not authorized to view this place's reviews",
    };
  }

  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  let query = supabase
    .from("place_review")
    .select(
      "*, user_info:reviewer_id(username, avatar_public_id, avatar_version), place_review_photo(id, public_id, version, position)",
    )
    .eq("place_id", placeId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data, error } = await query;

  if (error) {
    logger.error(`Failed fetching place reviews: ${error.message}`);

    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: see the return-type biome-ignore above
  const { page, hasNextPage } = splitPage<any>(data, pageSize);

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}

export type RespondToPlaceReviewCoreResult = {
  status: 200 | 401 | 403 | 404 | 500;
  message: string;
};

/**
 * Owner-only reply to a review. Lifted from respondToPlaceReview.ts:
 * ownership is enforced by joining through to the owning place (a
 * place_review row has no owner_id of its own).
 */
export async function respondToPlaceReviewCore(
  supabase: SupabaseClient,
  userId: string,
  reviewId: string,
  response: string,
): Promise<RespondToPlaceReviewCoreResult> {
  const { data: review, error: fetchError } = await supabase
    .from("place_review")
    .select("id, place:place_id(owner_id)")
    .eq("id", reviewId)
    .maybeSingle();

  if (fetchError || !review) {
    return { status: 404, message: "Review not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST's embedded-resource shape isn't worth a dedicated type for this one ownership check; no generated Supabase types exist in this repo (see PROJECT.md)
  const ownerId = (review as any).place?.owner_id;

  if (ownerId !== userId) {
    return {
      status: 403,
      message: "Not authorized to respond to this review",
    };
  }

  const { error: updateError } = await supabase
    .from("place_review")
    .update({
      owner_response: response,
      owner_response_at: new Date(),
    })
    .eq("id", reviewId);

  if (updateError) {
    return {
      status: 500,
      message: `Error responding to review: ${updateError.message}`,
    };
  }

  return { status: 200, message: "Response posted successfully!" };
}
