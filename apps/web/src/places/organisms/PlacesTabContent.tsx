import { getActivePlacePromotions } from "@/actions/getActivePlacePromotions";
import { getPlaceCategories } from "@/actions/getPlaceCategories";
import { getQueriedPlaces } from "@/actions/getQueriedPlaces";
import ViewToggle from "@/components/molecules/ViewToggle";
import { getTranslations } from "next-intl/server";
import NoPlacesEmptyState from "../molecules/NoPlacesEmptyState";
import PlaceCategoryChips from "../molecules/PlaceCategoryChips";
import AllPlacesList from "./AllPlacesList";
import FeaturedPlacesSlider from "./FeaturedPlacesSlider";
import PlacesMapView from "./PlacesMapView";
import PlacesSlider from "./PlacesSlider";

// Radius used for every Places section except "Around You" (which stays at
// 5km, matching the Events tab's own Around-You radius) — wide enough to
// cover a whole location without the naive "no radius filter at all" the
// spec warns against.
const EXPLORE_PLACES_RADIUS_KM = 20;
const AROUND_YOU_RADIUS_KM = 5;
const AROUND_YOU_SIZE = 20;
const OPEN_NOW_SIZE = 10;

// "Top Rated" means rated 4 or better, unless the visitor asked for more.
const TOP_RATED_MIN_RATING = 4;

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
  const t = await getTranslations("places");

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

  // The category chip row and the Filter modal drive every section on this
  // tab. Each row is its own question to the database (nearest, open now,
  // best rated) with the visitor's filters added to it, so a row shows what
  // the whole area has for those filters. The rows used to be fetched
  // without the filters and narrowed afterwards, which left "Open now" with
  // whatever restaurants happened to be among the ten nearest open places.
  // Featured is paid placement, not a search result: the filters do not
  // touch it. A search narrows "All Places" only.
  const effectiveMaxDistanceKm = maxDistanceKmParam ?? EXPLORE_PLACES_RADIUS_KM;
  const rowFilters = {
    lat,
    lng,
    categoryId: selectedCategory?.id ?? null,
    openNow: openNow ? true : null,
    minRating: minRatingParam ?? null,
    maxDistanceKm: effectiveMaxDistanceKm,
  };

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
    getQueriedPlaces({
      ...rowFilters,
      maxDistanceKm: Math.min(AROUND_YOU_RADIUS_KM, effectiveMaxDistanceKm),
      pageSize: AROUND_YOU_SIZE,
    }),
    getQueriedPlaces({
      ...rowFilters,
      openNow: true,
      pageSize: OPEN_NOW_SIZE,
    }),
    getQueriedPlaces({
      ...rowFilters,
      minRating: Math.max(TOP_RATED_MIN_RATING, minRatingParam ?? 0),
      pageSize: TOP_RATED_FETCH_SIZE,
    }),
    getQueriedPlaces({
      ...rowFilters,
      searchText: searchText ?? null,
      pageSize: view === "map" ? MAP_VIEW_PAGE_SIZE : undefined,
    }),
  ]);

  const featuredPlaces = featuredResult.data ?? [];
  const aroundYouPlaces = aroundYouResult.data ?? [];
  const openNowPlaces = openNowResult.data ?? [];
  // get_filtered_places orders by distance: the well-rated places nearest
  // to here, shown best first.
  const topRatedPlaces = [...(topRatedResult.data ?? [])]
    .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
    .slice(0, TOP_RATED_DISPLAY_SIZE);

  async function fetchAllPlacesPage(cursor: string | null) {
    "use server";
    return getQueriedPlaces({
      ...rowFilters,
      searchText: searchText ?? null,
      cursor,
    });
  }

  return (
    <div className="space-y-6">
      {/* Category chips sit directly under the Events/Places tabs, above
          every curated section — one filter surface that drives Featured,
          Around You, Open Now, Top Rated and the "All Places" list below. */}
      {categories.length > 0 && (
        <PlaceCategoryChips
          categories={categories}
          location={location}
          selectedSlug={selectedCategory?.slug ?? null}
        />
      )}

      {/* Featured Places (Milestone 5, paid promotion) is positioned first,
          per the original spec's ordering. "Popular Places" still has no
          ranking signal beyond raw place_analytics_event counts and stays
          out of scope. */}
      <FeaturedPlacesSlider places={featuredPlaces} />

      <PlacesSlider heading={t("aroundYou")} places={aroundYouPlaces} />

      <PlacesSlider heading={t("openNow")} places={openNowPlaces} />

      <PlacesSlider heading={t("topRated")} places={topRatedPlaces} />

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-xl font-bold">{t("allPlaces")}</h2>
          <ViewToggle view={view} />
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
