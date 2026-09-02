"use server";

import { createClient } from "@/config/supabase/server";
import { fetchPlaceBookingsPage } from "@abonten/services/places/placeBookingsReviewsCore";
import type { PaginatedResult } from "@abonten/types/pagination";
import type {
  BookingStatus,
  OwnerPlaceBooking,
} from "@abonten/types/placeBookingType";

/**
 * Owner-only, cursor-paginated list of a place's booking requests. Thin
 * wrapper — auth here, the ownership check + keyset query in
 * fetchPlaceBookingsPage (shared with /api/mobile).
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

  return fetchPlaceBookingsPage(supabase, user.id, placeId, options);
}
