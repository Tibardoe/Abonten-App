import getActivePromotedEventIds from "@/actions/getActivePromotedEventIds";
import { filterEventsByWindow } from "@/actions/getFilteredEvents";
import { getNearByEvents } from "@/actions/getNearByEvents";
import { getQueriedEvents } from "@/actions/getQueriedEvents";
import AllEventsList from "@/app/(pages)/events/location/[location]/AllEventsList";
import ViewToggle from "@/components/molecules/ViewToggle";
import EventsSlider from "@/components/organisms/EventsSlider";
import FeaturedEventsCarousel from "@/components/organisms/FeaturedEventsCarousel";
import EventCategoryChips from "@/events/molecules/EventCategoryChips";
import NoEventsFound from "@/events/molecules/NoEventsFound";
import NoEventsInLocation from "@/events/molecules/NoEventsInLocation";
import EventsMapView from "@/events/organisms/EventsMapView";
import { getFeaturedEvents } from "@abonten/core/dailyEventCache";
import {
  type EventFilters,
  filterEventList,
} from "@abonten/core/exploreFilters";
import type { UserPostType } from "@abonten/types/postsType";

// Radius (km) used for the "All Events" section — matches the previous
// getNearByEvents(lat, lng, 10000) call's 10km/10000m radius exactly
// (getQueriedEvents/get_filtered_events take maxDistanceKm in km, not
// meters). "Around You" below keeps its own separate 5km getNearByEvents
// call, untouched. Overridden when the Filter modal's Distance field is set
// (maxDistanceKm prop), same as PlacesTabContent's
// `maxDistanceKmParam ?? EXPLORE_PLACES_RADIUS_KM` pattern.
const EXPLORE_EVENTS_RADIUS_KM = 10;

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
  // Same nullable-coordinate handling as PlacesTabContent.tsx -- geocoding
  // can fail (geocodeAddress returns { lat: null, lng: null, error }), and
  // the events RPCs take plain numbers.
  const safeLat = lat ?? 0;
  const safeLng = lng ?? 0;

  // Unchanged from the previous inline explore/[location]/page.tsx
  // implementation -- these sliders keep their own fixed, curated semantics
  // regardless of the category/filter modal, same as Places' Around
  // You/Open Now/Top Rated sliders don't honor the filter modal either.
  const [eventsWithinLocation, eventsAroundYou, promotedEventIds] =
    await Promise.all([
      getNearByEvents(safeLat, safeLng, 10000),
      getNearByEvents(safeLat, safeLng, 5000),
      getActivePromotedEventIds(),
    ]);

  const aroundYouEvents: UserPostType[] = eventsAroundYou.data || [];
  const events: UserPostType[] = eventsWithinLocation.data || [];

  if (!events.length) {
    return <NoEventsInLocation location={location} />;
  }

  // The category chip row + Filter modal now drive EVERY section on this
  // tab, not just "All Events". The curated sliders below are filtered
  // client-side against the same bounded nearby payload they're already
  // derived from — no extra query. `minRating` is the one dimension that
  // payload can't express: it still narrows "All Events" through the DB and
  // is a no-op on the curated sliders (the native Explore screen documents
  // the same limitation).
  const curatedCoords = lat != null && lng != null ? { lat, lng } : null;
  const curatedFilters: EventFilters = {
    category: eventCategory ?? null,
    types: eventTypes ?? [],
    minPrice: minPrice ?? null,
    maxPrice: maxPrice ?? null,
    startDate: startDate ? startDate.slice(0, 10) : null,
    endDate: endDate ? endDate.slice(0, 10) : null,
    minRating: minRating ?? null,
    maxDistanceKm: maxDistanceKm ?? null,
  };

  // A paid Event Promotion makes an event featured-eligible for its
  // purchased period, exactly like the free, self-toggled `featured`
  // checkbox already does — same fold-in previously only wired into the
  // now-unlinked /events/location/[location] route; ported here since
  // /explore/[location]'s Events tab (this component) is the page users
  // actually land on today (see LocationAndFilterSection.tsx/MobileNavBar.tsx).
  const eventsWithPromotion = promotedEventIds.size
    ? events.map((event) =>
        promotedEventIds.has(event.id) ? { ...event, featured: true } : event,
      )
    : events;

  const curatedEvents = filterEventList(
    eventsWithPromotion,
    curatedFilters,
    curatedCoords,
  );
  const curatedAroundYou = filterEventList(
    aroundYouEvents,
    curatedFilters,
    curatedCoords,
  );

  const featuredEvents = getFeaturedEvents(curatedEvents, location);

  const topRatedOrganizers = filterEventsByWindow(
    curatedEvents,
    "top-rated-organizers",
  );
  const happeningToday = filterEventsByWindow(curatedEvents, "happening-today");
  const happeningThisWeek = filterEventsByWindow(
    curatedEvents,
    "happening-this-week",
  );
  const happeningThisMonth = filterEventsByWindow(
    curatedEvents,
    "happening-this-month",
  );

  // Only "All Events" (the primary, filterable listing) honors the category
  // chip row + Filter modal's price/date/rating/distance fields -- the
  // curated sliders above it keep their own fixed semantics, same split
  // Places uses for "All Places" vs. its sliders.
  const effectiveMaxDistanceKm = maxDistanceKm ?? EXPLORE_EVENTS_RADIUS_KM;

  const allEventsFilters = {
    lat: safeLat,
    lng: safeLng,
    maxDistanceKm: effectiveMaxDistanceKm,
    category: eventCategory ?? undefined,
    type: eventTypes ?? undefined,
    minPrice: minPrice ?? undefined,
    maxPrice: maxPrice ?? undefined,
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
    minRating: minRating ?? undefined,
  };

  const hasActiveFilters =
    !!eventCategory ||
    !!eventTypes?.length ||
    minPrice != null ||
    maxPrice != null ||
    !!startDate ||
    !!endDate ||
    minRating != null ||
    maxDistanceKm != null;

  // When any filter that the curated sliders can actually honour is set,
  // hide (rather than show a "nothing here" row for) whichever windows come
  // back empty — several can be empty at once under a category filter, and
  // the stacked placeholder rows read as noise. `minRating` is excluded: it
  // can't narrow the curated payload, so it never empties those windows.
  const curatedFilterActive =
    !!eventCategory ||
    !!eventTypes?.length ||
    minPrice != null ||
    maxPrice != null ||
    !!startDate ||
    !!endDate ||
    maxDistanceKm != null;

  const allEventsInitialPage = await getQueriedEvents({
    ...allEventsFilters,
    pageSize: view === "map" ? MAP_VIEW_PAGE_SIZE : undefined,
  });

  async function fetchAllEventsPage(cursor: string | null) {
    "use server";
    return getQueriedEvents({ ...allEventsFilters, cursor });
  }

  // The location has events overall (checked above) but none match the
  // current category/filters -- a distinct, more specific message than "no
  // events in this location at all", with a one-click way back to the
  // unfiltered list rather than making the user hunt for what to change.
  const noMatchingEventsState = (
    <NoEventsFound
      heading={
        eventCategory
          ? `No ${eventCategory} events found`
          : "No events match your filters"
      }
      description={
        eventCategory
          ? `We couldn't find any ${eventCategory} events in ${location}${hasActiveFilters ? " matching your filters" : ""}. Try a different category or check back soon.`
          : `We couldn't find any events in ${location} matching your filters. Try adjusting or clearing them.`
      }
      action={{
        label: "View all events",
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
        heading="Around-You"
        events={curatedAroundYou}
        urlPath={`location/${location}/explore/around-you`}
        hideWhenEmpty={curatedFilterActive}
      />

      <EventsSlider
        heading="Top-rated Organizers"
        events={topRatedOrganizers}
        urlPath={`location/${location}/explore/top-rated-organizers`}
        hideWhenEmpty={curatedFilterActive}
      />

      <EventsSlider
        heading="Happening Today"
        events={happeningToday}
        urlPath={`location/${location}/explore/happening-today`}
        hideWhenEmpty={curatedFilterActive}
      />

      <EventsSlider
        heading="Happening This Week"
        events={happeningThisWeek}
        urlPath={`location/${location}/explore/happening-this-week`}
        hideWhenEmpty={curatedFilterActive}
      />

      <EventsSlider
        heading="Happening This Month"
        events={happeningThisMonth}
        urlPath={`location/${location}/explore/happening-this-month`}
        hideWhenEmpty={curatedFilterActive}
      />

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-xl font-bold">All Events</h2>
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
