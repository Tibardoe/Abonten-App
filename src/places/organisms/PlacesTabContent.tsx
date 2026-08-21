import { getActivePlacePromotions } from "@/actions/getActivePlacePromotions";
import { getNearByPlaces } from "@/actions/getNearByPlaces";
import { getPlaceCategories } from "@/actions/getPlaceCategories";
import { getQueriedPlaces } from "@/actions/getQueriedPlaces";
import NoPlacesEmptyState from "../molecules/NoPlacesEmptyState";
import PlaceCategoryChips from "../molecules/PlaceCategoryChips";
import PlacesViewToggle from "../molecules/PlacesViewToggle";
import AllPlacesList from "./AllPlacesList";
import FeaturedPlacesSlider from "./FeaturedPlacesSlider";
import PlacesMapView from "./PlacesMapView";
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

// Places Phase 2, Milestone 3: the map view isn't infinite-scrolled, so it
// fetches one bounded page instead of AllPlacesList's cursor-paginated
// pageSize (DEFAULT_EVENTS_PAGE_SIZE) -- large enough to cover a realistic
// "All Places" result set within the existing maxDistanceKm radius without
// turning into an unbounded fetch.
const MAP_VIEW_PAGE_SIZE = 100;

export default async function PlacesTabContent({
  lat,
  lng,
  location,
  categorySlug,
  categoryId: categoryIdParam,
  openNow,
  minRating: minRatingParam,
  maxDistanceKm: maxDistanceKmParam,
  searchText,
  view = "list",
}: {
  lat: number | null;
  lng: number | null;
  location: string;
  categorySlug: string | null;
  // Filter-modal-driven equivalents of categorySlug/etc above (the modal
  // works in ids/numbers, PlaceCategoryChips works in slugs -- both are
  // accepted and resolve to the same `selectedCategory`/query params below,
  // see FilterModalPopup.tsx's "places" branch).
  categoryId?: number | null;
  openNow?: boolean;
  minRating?: number | null;
  maxDistanceKm?: number | null;
  searchText?: string | null;
  view?: "list" | "map";
}) {
  // Categories are a small, rarely-changing lookup table (see
  // getPlaceCategories.ts) — fetched first so the selected category's id can
  // be resolved from its slug before the filtered fetches below run.
  const categoriesResult = await getPlaceCategories();
  const categories =
    categoriesResult.status === 200 ? (categoriesResult.data ?? []) : [];
  const selectedCategory = categorySlug
    ? (categories.find((category) => category.slug === categorySlug) ?? null)
    : categoryIdParam
      ? (categories.find((category) => category.id === categoryIdParam) ?? null)
      : null;

  // Only "All Places" (the primary, filterable listing) honors the filter
  // modal's Open now/Rating/Distance/search choices -- the three bounded
  // sliders above it (Around You/Open Now/Top Rated) keep their own fixed,
  // curated semantics regardless of what the owner filtered by, same as the
  // Events tab's sliders don't change shape when a search is active.
  const effectiveMaxDistanceKm = maxDistanceKmParam ?? EXPLORE_PLACES_RADIUS_KM;

  const [
    featuredResult,
    aroundYouResult,
    openNowResult,
    topRatedResult,
    allPlacesInitialPage,
  ] = await Promise.all([
    // Deliberately no lat/lng/maxDistanceKm -- a paid, limited-inventory
    // placement buys real reach, not visibility only within a narrow
    // radius. Random ordering (a real `ORDER BY random()` inside
    // get_active_place_promotions) is what stops one advertiser from
    // permanently holding the top slot, not a proximity cutoff.
    getActivePlacePromotions(),
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
      maxDistanceKm: effectiveMaxDistanceKm,
      categoryId: selectedCategory?.id ?? null,
      openNow: openNow ?? null,
      minRating: minRatingParam ?? null,
      searchText: searchText ?? null,
      pageSize: view === "map" ? MAP_VIEW_PAGE_SIZE : undefined,
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
      maxDistanceKm: effectiveMaxDistanceKm,
      categoryId: selectedCategory?.id ?? null,
      openNow: openNow ?? null,
      minRating: minRatingParam ?? null,
      searchText: searchText ?? null,
      cursor,
    });
  }

  return (
    <div className="space-y-6">
      {/* Featured Places (Milestone 5, paid promotion) is positioned first,
          per the original spec's ordering. "Popular Places" still has no
          ranking signal beyond raw place_analytics_event counts and stays
          out of scope. */}
      <FeaturedPlacesSlider places={featuredResult.data ?? []} />

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
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-lg font-medium">All Places</h2>
          <PlacesViewToggle view={view} />
        </div>

        {view === "map" ? (
          (allPlacesInitialPage.data ?? []).length > 0 ? (
            <PlacesMapView places={allPlacesInitialPage.data} />
          ) : (
            <NoPlacesEmptyState />
          )
        ) : (
          <AllPlacesList
            key={`${lat}-${lng}-${selectedCategory?.id ?? "all"}-${openNow ?? "any"}-${minRatingParam ?? "any"}-${effectiveMaxDistanceKm}-${searchText ?? ""}`}
            queryKey={[
              "places",
              "filtered",
              lat,
              lng,
              effectiveMaxDistanceKm,
              selectedCategory?.id ?? null,
              openNow ?? null,
              minRatingParam ?? null,
              searchText ?? null,
            ]}
            initialPage={allPlacesInitialPage}
            fetchPage={fetchAllPlacesPage}
            emptyState={<NoPlacesEmptyState />}
          />
        )}
      </div>
    </div>
  );
}
