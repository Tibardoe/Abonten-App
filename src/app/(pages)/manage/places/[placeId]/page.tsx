export const dynamic = "force-dynamic";

import { getPlaceBookings } from "@/actions/getPlaceBookings";
import { getPlaceInsights } from "@/actions/getPlaceInsights";
import { getPlacePromotionTiers } from "@/actions/getPlacePromotionTiers";
import { getPlaceReviews } from "@/actions/getPlaceReviews";
import { createClient } from "@/config/supabase/server";
import ManagePlaceView from "@/places/organisms/ManagePlaceView";
import type { BookingStatus } from "@/types/placeBookingType";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// Server Component ownership gate for a place's management page -- fetches
// the place (any status, unlike the public getPlaceBySlug.ts which is
// scoped to status='published') and checks owner_id against the signed-in
// user inline, same "fetch-then-compare" shape getEventForEdit.ts's
// `.eq("organizer_id", user.id)` uses, just done here directly since a
// management page (not a modal/action) is the one place in this milestone
// where the check belongs in the page itself.
export default async function page({
  params,
}: {
  params: Promise<{ placeId: string }>;
}) {
  const { placeId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <p className="p-8 text-center text-muted-foreground">
        Sign in to manage this place.
      </p>
    );
  }

  const { data: place, error: placeError } = await supabase
    .from("place")
    .select("*, place_category(id, name, slug)")
    .eq("id", placeId)
    .maybeSingle();

  if (placeError || !place) {
    return (
      <p className="p-8 text-center text-muted-foreground">Place not found.</p>
    );
  }

  if (place.owner_id !== user.id) {
    return (
      <p className="p-8 text-center text-muted-foreground">
        You're not authorized to manage this place.
      </p>
    );
  }

  const [
    { data: openingHours },
    { data: services },
    { data: photos },
    reviewsFirstPage,
    bookingsFirstPage,
    insightsResponse,
    tiersResponse,
    { data: activePromotionRaw },
  ] = await Promise.all([
    supabase
      .from("place_opening_hours")
      .select("*")
      .eq("place_id", placeId)
      .order("day_of_week", { ascending: true }),
    supabase
      .from("place_service")
      .select("*")
      .eq("place_id", placeId)
      .order("position", { ascending: true }),
    supabase
      .from("place_photo")
      .select("*")
      .eq("place_id", placeId)
      .order("position", { ascending: true }),
    getPlaceReviews(placeId),
    // Defaults to 'pending' -- the most actionable view when the owner
    // first lands on the Bookings tab, mirrored by
    // ManagePlaceBookingsSection.tsx's own default statusFilter.
    getPlaceBookings(placeId, { status: "pending" }),
    getPlaceInsights(placeId),
    getPlacePromotionTiers(),
    // "Is this place currently featured" is always computed from
    // ends_at > now(), never stored -- same convention
    // getActivePlacePromotions.ts's RPC uses. A plain inline query is enough
    // here (single place, owner-only dashboard), unlike the Explore page's
    // random-ordered, cross-place Featured Places query.
    supabase
      .from("place_promotion")
      .select("ends_at, place_promotion_tier(duration_label)")
      .eq("place_id", placeId)
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const insights =
    insightsResponse.status === 200 ? (insightsResponse.data ?? {}) : {};
  const promotionTiers =
    tiersResponse.status === 200 ? (tiersResponse.data ?? []) : [];
  // postgrest-js infers place_promotion_tier's embed as an array here
  // (this client has no generated Database types to tell it the join is
  // many-to-one) even though it's actually a single row at runtime -- same
  // untyped-client situation every other manual cast in this file's schema
  // works around, see PROJECT.md's "no generated Supabase types" note.
  const activePromotion = activePromotionRaw as unknown as {
    ends_at: string;
    place_promotion_tier: { duration_label: string } | null;
  } | null;
  const currentPromotion = activePromotion
    ? {
        ends_at: activePromotion.ends_at,
        tier_label:
          activePromotion.place_promotion_tier?.duration_label ?? null,
      }
    : null;

  async function fetchReviewsPage(cursor: string | null) {
    "use server";
    return getPlaceReviews(placeId, { cursor });
  }

  async function fetchBookingsPage(
    status: BookingStatus | undefined,
    cursor: string | null,
  ) {
    "use server";
    return getPlaceBookings(placeId, { status, cursor });
  }

  return (
    <ManagePlaceView
      place={place}
      openingHours={openingHours ?? []}
      services={services ?? []}
      photos={photos ?? []}
      reviewsFirstPage={reviewsFirstPage}
      fetchReviewsPage={fetchReviewsPage}
      bookingsFirstPage={bookingsFirstPage}
      fetchBookingsPage={fetchBookingsPage}
      insights={insights}
      promotionTiers={promotionTiers}
      currentPromotion={currentPromotion}
    />
  );
}
