import { filterEventsByWindow } from "@/actions/getFilteredEvents";
import { getNearByEvents } from "@/actions/getNearByEvents";
import AllEventsList from "@/app/(pages)/events/location/[location]/AllEventsList";
import EventsSlider from "@/components/organisms/EventsSlider";
import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import { isExploreTab } from "@/places/exploreTab";
import ExploreTabs from "@/places/organisms/ExploreTabs";
import PlacesTabContent from "@/places/organisms/PlacesTabContent";
import type { UserPostType } from "@/types/postsType";
import { geocodeAddress } from "@/utils/geocodeServerSide";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const noEventsFoundState = (
  <div className="flex flex-col items-center justify-center min-h-[60vh] py-5 px-4 text-center">
    <div className="max-w-md mx-auto">
      <div className="relative w-64 h-64 mx-auto mb-8">
        <img
          src="/assets/images/notFound.jpg"
          alt="No events found"
          className="w-full h-full object-contain opacity-90"
        />
      </div>

      <h2 className="text-2xl font-medium text-muted-foreground mb-1">
        No Events Found
      </h2>

      <p className="text-muted-foreground text-sm mb-6 max-w-md">
        We couldn’t find any events in this location. Try changing your location
        or be the first to post one.
      </p>
    </div>
  </div>
);

export default async function page({
  params,
  searchParams,
}: {
  params: Promise<{ location: string }>;
  searchParams: Promise<{
    lat?: string;
    lng?: string;
    tab?: string;
    category?: string;
  }>;
}) {
  const { location } = await params;
  const { lat: latParam, lng: lngParam, tab, category } = await searchParams;

  const safeLocation = location ?? "";
  const initialTab = isExploreTab(tab) ? tab : "events";

  // Same coordinate resolution as /events/location/[location]/page.tsx: skip
  // re-geocoding the slug text when the browser already gave us coordinates
  // (e.g. the landing page's "use my current location" flow).
  const coordsFromQuery =
    latParam &&
    lngParam &&
    Number.isFinite(Number(latParam)) &&
    Number.isFinite(Number(lngParam))
      ? { lat: Number(latParam), lng: Number(lngParam) }
      : null;

  const { lat, lng } = coordsFromQuery ?? (await geocodeAddress(safeLocation));

  // ---- Events tab ---------------------------------------------------
  // Deliberate light duplication of /events/location/[location]/page.tsx's
  // fetch orchestration (same actions, same reused components) rather than
  // a shared import, so that existing route stays completely untouched and
  // zero-risk. See Milestone 5 plan notes.
  const [eventsWithinLocation, eventsAroundYou] = await Promise.all([
    getNearByEvents(lat, lng, 10000),
    getNearByEvents(lat, lng, 5000),
  ]);

  const aroundYouEvents: UserPostType[] = eventsAroundYou.data || [];
  const events: UserPostType[] = eventsWithinLocation.data || [];

  const topRatedOrganizers = filterEventsByWindow(
    events,
    "top-rated-organizers",
  );
  const happeningToday = filterEventsByWindow(events, "happening-today");
  const happeningThisWeek = filterEventsByWindow(events, "happening-this-week");
  const happeningThisMonth = filterEventsByWindow(
    events,
    "happening-this-month",
  );

  async function fetchAllEventsPage(cursor: string | null) {
    "use server";
    return getNearByEvents(lat, lng, 10000, { cursor });
  }

  const eventsContent = events.length ? (
    <>
      <EventsSlider
        heading="Around-You"
        events={aroundYouEvents}
        urlPath={`location/${safeLocation}/explore/around-you`}
      />

      <EventsSlider
        heading="Top-rated Organizers"
        events={topRatedOrganizers}
        urlPath={`location/${safeLocation}/explore/top-rated-organizers`}
      />

      <EventsSlider
        heading="Happening Today"
        events={happeningToday}
        urlPath={`location/${safeLocation}/explore/happening-today`}
      />

      <EventsSlider
        heading="Happening This Week"
        events={happeningThisWeek}
        urlPath={`location/${safeLocation}/explore/happening-this-week`}
      />

      <EventsSlider
        heading="Happening This Month"
        events={happeningThisMonth}
        urlPath={`location/${safeLocation}/explore/happening-this-month`}
      />

      <div className="mb-5">
        <h2 className="text-lg font-medium">All Events</h2>

        <AllEventsList
          key={`${lat}-${lng}`}
          queryKey={["events", "nearby", lat, lng, 10000]}
          initialPage={eventsWithinLocation}
          fetchPage={fetchAllEventsPage}
          emptyState={noEventsFoundState}
        />
      </div>
    </>
  ) : (
    noEventsFoundState
  );

  return (
    <section className="space-y-2">
      <h1 className="text-xl md:text-2xl font-bold">Explore</h1>

      <LocationAndFilterSection />

      <ExploreTabs
        initialTab={initialTab}
        eventsContent={eventsContent}
        placesContent={
          <PlacesTabContent
            lat={lat ?? null}
            lng={lng ?? null}
            location={safeLocation}
            categorySlug={category ?? null}
          />
        }
      />
    </section>
  );
}
