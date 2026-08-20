export const dynamic = "force-dynamic";

import { getPlaceInsights } from "@/actions/getPlaceInsights";
import { getPlaceReviews } from "@/actions/getPlaceReviews";
import { createClient } from "@/config/supabase/server";
import ManagePlaceView from "@/places/organisms/ManagePlaceView";

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
    insightsResponse,
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
    getPlaceInsights(placeId),
  ]);

  const insights =
    insightsResponse.status === 200 ? (insightsResponse.data ?? {}) : {};

  async function fetchReviewsPage(cursor: string | null) {
    "use server";
    return getPlaceReviews(placeId, { cursor });
  }

  return (
    <ManagePlaceView
      place={place}
      openingHours={openingHours ?? []}
      services={services ?? []}
      photos={photos ?? []}
      reviewsFirstPage={reviewsFirstPage}
      fetchReviewsPage={fetchReviewsPage}
      insights={insights}
    />
  );
}
