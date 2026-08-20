import { getNearByPlaces } from "@/actions/getNearByPlaces";
import { getPlaceCategories } from "@/actions/getPlaceCategories";
import { getQueriedPlaces } from "@/actions/getQueriedPlaces";
import NoPlacesEmptyState from "../molecules/NoPlacesEmptyState";
import PlaceCategoryChips from "../molecules/PlaceCategoryChips";
import AllPlacesList from "./AllPlacesList";
import PlacesSlider from "./PlacesSlider";

// Radius used for every Places section except "Around You" (which stays at
// 5km, matching the Events tab's own Around-You radius) — wide enough to
// cover a whole location without the naive "no radius filter at all" the
// spec warns against.
const EXPLORE_PLACES_RADIUS_KM = 20;

// Phase 1's get_filtered_places RPC orders strictly by (distance_km, id) —
// there's no rating-sort option (confirmed against
// supabase/migrations/20260820090000_add_places_feature.sql), and adding one
// is out of this milestone's scope. "Top Rated" instead fetches a bounded,
// already radius + minRating-filtered page (still a real DB filter, not a
// naive full-table scan) and re-sorts that small page client-side by
// avg_rating for display only.
const TOP_RATED_FETCH_SIZE = 20;
const TOP_RATED_DISPLAY_SIZE = 10;

export default async function PlacesTabContent({
  lat,
  lng,
  location,
  categorySlug,
}: {
  lat: number | null;
  lng: number | null;
  location: string;
  categorySlug: string | null;
}) {
  // Categories are a small, rarely-changing lookup table (see
  // getPlaceCategories.ts) — fetched first so the selected category's id can
  // be resolved from its slug before the filtered fetches below run.
  const categoriesResult = await getPlaceCategories();
  const categories =
    categoriesResult.status === 200 ? (categoriesResult.data ?? []) : [];
  const selectedCategory = categorySlug
    ? (categories.find((category) => category.slug === categorySlug) ?? null)
    : null;

  const [aroundYouResult, openNowResult, topRatedResult, allPlacesInitialPage] =
    await Promise.all([
      getNearByPlaces(lat ?? 0, lng ?? 0, 5000),
      getQueriedPlaces({
        lat,
        lng,
        openNow: true,
        maxDistanceKm: EXPLORE_PLACES_RADIUS_KM,
        pageSize: 10,
      }),
      getQueriedPlaces({
        lat,
        lng,
        minRating: 4,
        maxDistanceKm: EXPLORE_PLACES_RADIUS_KM,
        pageSize: TOP_RATED_FETCH_SIZE,
      }),
      getQueriedPlaces({
        lat,
        lng,
        maxDistanceKm: EXPLORE_PLACES_RADIUS_KM,
        categoryId: selectedCategory?.id ?? null,
      }),
    ]);

  const topRatedPlaces = [...(topRatedResult.data ?? [])]
    .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
    .slice(0, TOP_RATED_DISPLAY_SIZE);

  async function fetchAllPlacesPage(cursor: string | null) {
    "use server";
    return getQueriedPlaces({
      lat,
      lng,
      maxDistanceKm: EXPLORE_PLACES_RADIUS_KM,
      categoryId: selectedCategory?.id ?? null,
      cursor,
    });
  }

  return (
    <div className="space-y-6">
      {/* Featured Places and Popular Places are intentionally omitted for
          Phase 1 — see PlacesTabContent's report in the Milestone 5 summary:
          there's no promotion/"featured" flag yet, and no engagement-ranking
          RPC beyond raw place_analytics_event counts. */}

      <PlacesSlider heading="Around You" places={aroundYouResult.data ?? []} />

      <PlacesSlider heading="Open Now" places={openNowResult.data ?? []} />

      <PlacesSlider heading="Top Rated" places={topRatedPlaces} />

      {categories.length > 0 && (
        <PlaceCategoryChips
          categories={categories}
          location={location}
          selectedSlug={selectedCategory?.slug ?? null}
        />
      )}

      <div>
        <h2 className="text-lg font-medium mb-1">All Places</h2>

        <AllPlacesList
          key={`${lat}-${lng}-${selectedCategory?.id ?? "all"}`}
          queryKey={[
            "places",
            "filtered",
            lat,
            lng,
            EXPLORE_PLACES_RADIUS_KM,
            selectedCategory?.id ?? null,
          ]}
          initialPage={allPlacesInitialPage}
          fetchPage={fetchAllPlacesPage}
          emptyState={<NoPlacesEmptyState />}
        />
      </div>
    </div>
  );
}
