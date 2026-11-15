"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
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
export const getPlaceBookings = withActionLocale(
  async function getPlaceBookings(
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
        message: tr("userNotAuthenticated"),
      };
    }

    // Managing as a team: the chosen team, if the person's role covers this.

    const actor = await actingFor(user.id, "bookings.manage");

    if (actor.error)
      return { ...actor.error, data: [], nextCursor: null, hasNextPage: false };

    return fetchPlaceBookingsPage(supabase, actor.accountId, placeId, options);
  },
);
