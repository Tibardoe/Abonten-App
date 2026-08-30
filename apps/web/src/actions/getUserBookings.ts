"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { CustomerPlaceBooking } from "@abonten/types/placeBookingType";

/**
 * Auth-required, self-only, cursor-paginated list of the signed-in user's
 * own booking requests across all places -- deliberately has no username
 * parameter (unlike getOrganizerPlaces.ts / getUserReviews.ts), since a
 * person's own bookings aren't public, per the milestone spec's
 * isCurrentUser-gated "Bookings" profile tab. Joined to place(name, slug)
 * so each row can link back to /places/[slug].
 */
export async function getUserBookings(options?: {
  cursor?: string | null;
  pageSize?: number;
}): Promise<PaginatedResult<CustomerPlaceBooking>> {
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

  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  let query = supabase
    .from("place_booking")
    .select("*, place:place_id(name, slug)")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data, error } = await query;

  if (error) {
    logger.error(`Failed fetching user bookings: ${error.message}`);

    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  const { page, hasNextPage } = splitPage<CustomerPlaceBooking>(
    (data ?? []) as unknown as CustomerPlaceBooking[],
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
