import { getExploreEventSections } from "@/actions/getExploreEventSections";
import { getNearByEvents } from "@/actions/getNearByEvents";
import { getQueriedEvents } from "@/actions/getQueriedEvents";
import AllEventsList from "@/app/[locale]/(pages)/events/location/[location]/AllEventsList";
import ViewToggle from "@/components/molecules/ViewToggle";
import EventsSlider from "@/components/organisms/EventsSlider";
import FeaturedEventsCarousel from "@/components/organisms/FeaturedEventsCarousel";
import EventCategoryChips from "@/events/molecules/EventCategoryChips";
import NoEventsFound from "@/events/molecules/NoEventsFound";
import NoEventsInLocation from "@/events/molecules/NoEventsInLocation";
import EventsMapView from "@/events/organisms/EventsMapView";
import { locationLabelFromSlug } from "@/utils/locationLabel";
import { requestTimeZone } from "@/utils/requestTimeZone";
import { eventCategoryLabel } from "@abonten/core/categoryLabels";
import { getFeaturedEvents } from "@abonten/core/dailyEventCache";
import {
  type EventFilters,
  countActiveEventFilters,
} from "@abonten/core/exploreFilters";
import { EXPLORE_EVENTS_RADIUS_KM } from "@abonten/core/exploreSections";
import { calendarDayOf } from "@abonten/core/time/timeZone";
import { getTranslations } from "next-intl/server";

// The area the Events tab browses is EXPLORE_EVENTS_RADIUS_KM (10 km),
// "Around You" 5 km inside it; the Filter modal's Distance field narrows
// both (same as PlacesTabContent's `maxDistanceKmParam ??
// EXPLORE_PLACES_RADIUS_KM`).

// The Events tab's "All Events" isn't infinite-scrolled in map view --
// fetches one bounded page instead of AllEventsList's cursor-paginated
// default, same rationale/size as Places' MAP_VIEW_PAGE_SIZE in
// PlacesTabContent.tsx.
const MAP_VIEW_PAGE_SIZE = 100;

export default async function EventsTabContent({
  lat,
  lng,
  location,
  eventCategory,
  eventTypes,
  minPrice,
  maxPrice,
  startDate,
  endDate,
  minRating,
  maxDistanceKm,
  view = "list",
}: {
  lat: number | null;
  lng: number | null;
  location: string;
  eventCategory: string | null;
  eventTypes?: string[] | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  minRating?: number | null;
  maxDistanceKm?: number | null;
  view?: "list" | "map";
}) {
  const t = await getTranslations("events");
  const tc = await getTranslations("core");

  // Same nullable-coordinate handling as PlacesTabContent.tsx -- geocoding
  // can fail (geocodeAddress returns { lat: null, lng: null, error }), and
  // the events RPCs take plain numbers.
  const safeLat = lat ?? 0;
  const safeLng = lng ?? 0;

  // The category chip row and the Filter modal drive every section on this
  // tab. The filters are applied in the database, by the same rule for the
  // rows and for "All Events", and each row is taken from every event in
  // the area (not from the first page of a nearby list, which is what they
  // used to be cut from). Featured is paid placement, not a search result:
  // the filters do not touch it.
  //
  // Dates in the URL are the browser's local midnights; they are read as
  // the days they name on the visitor's calendar.
  const zone = await requestTimeZone();
  const filters: EventFilters = {
    category: eventCategory ?? null,
    types: eventTypes ?? [],
    minPrice: minPrice ?? null,
    maxPrice: maxPrice ?? null,
    startDate: calendarDayOf(startDate, zone),
    endDate: calendarDayOf(endDate, zone),
    minRating: minRating ?? null,
    maxDistanceKm: maxDistanceKm ?? null,
  };
  const hasActiveFilters = countActiveEventFilters(filters) > 0;
  const effectiveMaxDistanceKm = maxDistanceKm ?? EXPLORE_EVENTS_RADIUS_KM;

  const allEventsFilters = {
    lat: safeLat,
    lng: safeLng,
    maxDistanceKm: effectiveMaxDistanceKm,
    category: eventCategory ?? undefined,
    type: eventTypes ?? undefined,
    minPrice: minPrice ?? undefined,
    maxPrice: maxPrice ?? undefined,
    startDate: filters.startDate ?? undefined,
    endDate: filters.endDate ?? undefined,
    minRating: minRating ?? undefined,
  };

  const [sectionsResult, allEventsInitialPage, anyEventHere] =
    await Promise.all([
      getExploreEventSections({ lat: safeLat, lng: safeLng, filters }),
      // The Events tab's "All Events" isn't infinite-scrolled in map view.
      getQueriedEvents({
        ...allEventsFilters,
        pageSize: view === "map" ? MAP_VIEW_PAGE_SIZE : undefined,
      }),
      // "Nothing here at all" and "nothing matches your filters" are
      // different answers; with filters on, one row tells them apart.
      hasActiveFilters
        ? getNearByEvents(safeLat, safeLng, EXPLORE_EVENTS_RADIUS_KM * 1000, {
            pageSize: 1,
          })
        : null,
    ]);

  const sections = sectionsResult.data;
  const areaHasEvents = anyEventHere
    ? anyEventHere.data.length > 0
    : allEventsInitialPage.data.length > 0 ||
      sections.aroundYou.length > 0 ||
      sections.featured.length > 0;

  if (!areaHasEvents) {
    return <NoEventsInLocation location={location} />;
  }

  // Which paid placements show, and which leads, rotates daily.
  const featuredEvents = getFeaturedEvents(sections.featured, location);

  async function fetchAllEventsPage(cursor: string | null) {
    "use server";
    return getQueriedEvents({ ...allEventsFilters, cursor });
  }

  // The location has events overall (checked above) but none match the
  // current category/filters -- a distinct, more specific message than "no
  // events in this location at all", with a one-click way back to the
  // unfiltered list rather than making the user hunt for what to change.
  // The category and the place as the visitor reads them, not as they are
  // stored ("Music & Concerts") or written in the address ("east-legon").
  const categoryName = eventCategory
    ? eventCategoryLabel(tc, eventCategory)
    : null;
  const placeName = locationLabelFromSlug(location, t("yourArea"));
  const onlyCategoryChosen = countActiveEventFilters(filters) === 1;
  const noMatchingEventsState = (
    <NoEventsFound
      heading={
        categoryName
          ? t("noEventsFound3", { eventCategory: categoryName })
          : t("noEventsMatchYourFilters")
      }
      description={
        categoryName
          ? onlyCategoryChosen
            ? t("weCouldnTFindAnyEvents2", {
                eventCategory: categoryName,
                location: placeName,
              })
            : t("weCouldnTFindAnyEventsFiltered", {
                eventCategory: categoryName,
                location: placeName,
              })
          : t("weCouldnTFindAnyEvents3", { location: placeName })
      }
      action={{
        label: t("viewAllEvents"),
        href: `/explore/${location}?tab=events`,
      }}
    />
  );

  return (
    <div className="space-y-6">
      {/* Category chips sit directly under the Events/Places tabs, above
          every curated section — one filter surface that drives Featured,
          Around You, Happening This… and the "All Events" list below. */}
      <EventCategoryChips
        location={location}
        selectedCategory={eventCategory}
      />

      <FeaturedEventsCarousel events={featuredEvents} />

      <EventsSlider
        heading={t("aroundYou2")}
        events={sections.aroundYou}
        urlPath={`location/${location}/explore/around-you`}
        hideWhenEmpty
      />

      <EventsSlider
        heading={t("fromTopRatedOrganizers")}
        events={sections.topRatedOrganizers}
        urlPath={`location/${location}/explore/top-rated-organizers`}
        hideWhenEmpty
      />

      <EventsSlider
        heading={t("happeningToday2")}
        events={sections.happeningToday}
        urlPath={`location/${location}/explore/happening-today`}
        hideWhenEmpty
      />

      <EventsSlider
        heading={t("happeningThisWeek2")}
        events={sections.happeningThisWeek}
        urlPath={`location/${location}/explore/happening-this-week`}
        hideWhenEmpty
      />

      <EventsSlider
        heading={t("happeningThisMonth2")}
        events={sections.happeningThisMonth}
        urlPath={`location/${location}/explore/happening-this-month`}
        hideWhenEmpty
      />

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-xl font-bold">{t("allEvents")}</h2>
          <ViewToggle view={view} />
        </div>

        {view === "map" ? (
          (allEventsInitialPage.data ?? []).length > 0 ? (
            <EventsMapView
              events={allEventsInitialPage.data}
              location={location}
              eventCategory={eventCategory}
            />
          ) : (
            noMatchingEventsState
          )
        ) : (
          <AllEventsList
            key={`${safeLat}-${safeLng}-${eventCategory ?? "all"}-${(eventTypes ?? []).join(",")}-${minPrice ?? ""}-${maxPrice ?? ""}-${startDate ?? ""}-${endDate ?? ""}-${minRating ?? ""}-${effectiveMaxDistanceKm}`}
            queryKey={[
              "events",
              "filtered",
              safeLat,
              safeLng,
              effectiveMaxDistanceKm,
              eventCategory ?? null,
              eventTypes ?? null,
              minPrice ?? null,
              maxPrice ?? null,
              startDate ?? null,
              endDate ?? null,
              minRating ?? null,
            ]}
            initialPage={allEventsInitialPage}
            fetchPage={fetchAllEventsPage}
            emptyState={noMatchingEventsState}
          />
        )}
      </div>
    </div>
  );
}
