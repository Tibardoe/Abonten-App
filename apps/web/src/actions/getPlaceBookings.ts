"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@/utils/pagination";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type {
  BookingStatus,
  OwnerPlaceBooking,
} from "@abonten/types/placeBookingType";

/**
 * Owner-only, cursor-paginated list of a place's booking requests --
 * mirrors getPlaceClaimRequests.ts's shape (auth check, then an ownership
 * check, then keyset pagination on created_at/id), joined to the
 * customer's username and the requested service's name for display.
 * `status` is optional (unlike getPlaceClaimRequests.ts, which always
 * defaults to 'pending') so the owner's Bookings tab can also show an
 * unfiltered "All" view.
 */
export async function getPlaceBookings(
  placeId: string,
  options?: {
    status?: BookingStatus;
    cursor?: string | null;
    pageSize?: number;
  },
): Promise<PaginatedResult<OwnerPlaceBooking>> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      status: 401,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not authenticated",
    };
  }

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

  if (place.owner_id !== user.id) {
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
