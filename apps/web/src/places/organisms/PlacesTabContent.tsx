import { getActivePlacePromotions } from "@/actions/getActivePlacePromotions";
import { getExplorePlaceSections } from "@/actions/getExplorePlaceSections";
import { getPlaceCategories } from "@/actions/getPlaceCategories";
import { getQueriedPlaces } from "@/actions/getQueriedPlaces";
import RefreshErrorRetry from "@/components/molecules/RefreshErrorRetry";
import ViewToggle from "@/components/molecules/ViewToggle";
import { EXPLORE_PLACES_RADIUS_KM } from "@abonten/core/explorePlaceSections";
import { getTranslations } from "next-intl/server";
import NoPlacesEmptyState from "../molecules/NoPlacesEmptyState";
import PlaceCategoryChips from "../molecules/PlaceCategoryChips";
import AllPlacesList from "./AllPlacesList";
import FeaturedPlacesSlider from "./FeaturedPlacesSlider";
import PlacesMapView from "./PlacesMapView";
import PlacesSlider from "./PlacesSlider";

// "Top Rated" comes best rated first from the nearest well-rated places
// (get_explore_place_sections); the row shows the first ten.
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
  // tab. The rows (nearest, open now, best rated) come from one question to
  // the database with the visitor's filters added to it, so a row shows
  // what the whole area has for those filters, by the same rule as "All
  // Places". Featured is paid placement, not a search result: the filters
  // do not touch it. A search narrows "All Places" only.
  const effectiveMaxDistanceKm = maxDistanceKmParam ?? EXPLORE_PLACES_RADIUS_KM;
  const rowFilters = {
    lat,
    lng,
    categoryId: selectedCategory?.id ?? null,
    openNow: openNow ? true : null,
    minRating: minRatingParam ?? null,
    maxDistanceKm: effectiveMaxDistanceKm,
  };

  const [featuredResult, sectionsResult, allPlacesInitialPage] =
    await Promise.all([
      // Deliberately no lat/lng/maxDistanceKm -- a paid, limited-inventory
      // placement buys real reach, not visibility only within a narrow
      // radius. Random ordering (a real `ORDER BY random()` inside
      // get_active_place_promotions) is what stops one advertiser from
      // permanently holding the top slot, not a proximity cutoff.
      getActivePlacePromotions(),
      getExplorePlaceSections({
        lat,
        lng,
        filters: {
          categoryId: rowFilters.categoryId,
          minRating: rowFilters.minRating,
          openNow: Boolean(openNow),
          maxDistanceKm: effectiveMaxDistanceKm,
        },
      }),
      getQueriedPlaces({
        ...rowFilters,
        searchText: searchText ?? null,
        pageSize: view === "map" ? MAP_VIEW_PAGE_SIZE : undefined,
      }),
    ]);

  const featuredPlaces = featuredResult.data ?? [];
  // A read that failed is not "no places here": the rows say they could not
  // be loaded, and "All Places" fetches its first page again in the browser.
  const rowsFailed = sectionsResult.status !== 200;
  const listFailed = allPlacesInitialPage.status !== 200;
  const { aroundYou, openNow: openNowPlaces, topRated } = sectionsResult.data;
  const topRatedPlaces = topRated.slice(0, TOP_RATED_DISPLAY_SIZE);

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

      {rowsFailed ? (
        <RefreshErrorRetry message={t("couldNotLoadPlacesHere")} />
      ) : (
        <>
          <PlacesSlider heading={t("aroundYou")} places={aroundYou} />

          <PlacesSlider heading={t("openNow")} places={openNowPlaces} />

          <PlacesSlider heading={t("topRated")} places={topRatedPlaces} />
        </>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-xl font-bold">{t("allPlaces")}</h2>
          <ViewToggle view={view} />
        </div>

        {view === "map" ? (
          listFailed ? (
            <RefreshErrorRetry message={t("couldNotLoadPlacesHere")} />
          ) : (allPlacesInitialPage.data ?? []).length > 0 ? (
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
            initialPage={listFailed ? null : allPlacesInitialPage}
            fetchPage={fetchAllPlacesPage}
            emptyState={<NoPlacesEmptyState />}
          />
        )}
      </div>
    </div>
  );
}
