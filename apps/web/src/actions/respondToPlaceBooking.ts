"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { respondToPlaceBookingCore } from "@abonten/services/places/placeBookingsReviewsCore";

type RespondToPlaceBookingInput = {
  bookingId: string;
  decision: "accept" | "decline";
};

/**
 * Owner-only accept/decline of a pending booking request. Thin wrapper —
 * auth here, ownership + the race guard + the customer notification in
 * respondToPlaceBookingCore (shared with /api/mobile).
 */
export const respondToPlaceBooking = withActionLocale(
  async function respondToPlaceBooking(formData: RespondToPlaceBookingInput) {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        status: 401 as const,
        message: tr("userNotAuthenticated"),
      };
    }

    // Managing as a team: the chosen team, if the person's role covers this.

    const actor = await actingFor(user.id, "bookings.manage");

    if (actor.error) return actor.error;

    return respondToPlaceBookingCore(
      supabase,
      actor.accountId,
      formData.bookingId,
      formData.decision,
    );
  },
);
