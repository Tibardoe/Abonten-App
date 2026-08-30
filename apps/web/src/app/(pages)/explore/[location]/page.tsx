import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import EventsTabContent from "@/events/organisms/EventsTabContent";
import { isExploreTab } from "@/places/exploreTab";
import ExploreTabs from "@/places/organisms/ExploreTabs";
import PlacesTabContent from "@/places/organisms/PlacesTabContent";
import { geocodeAddress } from "@/utils/geocodeServerSide";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

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
    categoryId?: string;
    eventCategory?: string;
    eventTypes?: string;
    eventMinPrice?: string;
    eventMaxPrice?: string;
    eventFrom?: string;
    eventTo?: string;
    eventRating?: string;
    eventDistance?: string;
    openNow?: string;
    rating?: string;
    distance?: string;
    q?: string;
    view?: string;
  }>;
}) {
  const { location } = await params;
  const {
    lat: latParam,
    lng: lngParam,
    tab,
    category,
    categoryId,
    eventCategory,
    eventTypes,
    eventMinPrice,
    eventMaxPrice,
    eventFrom,
    eventTo,
    eventRating,
    eventDistance,
    openNow,
    rating,
    distance,
    q,
    view,
  } = await searchParams;

  const exploreView = view === "map" ? "map" : "list";

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

  return (
    <section className="space-y-2">
      <h1 className="text-xl md:text-2xl font-bold">Explore</h1>

      <LocationAndFilterSection />

      <ExploreTabs
        initialTab={initialTab}
        eventsContent={
          <EventsTabContent
            lat={lat ?? null}
            lng={lng ?? null}
            location={safeLocation}
            eventCategory={eventCategory ?? null}
            eventTypes={
              eventTypes ? eventTypes.split(",").filter(Boolean) : null
            }
            minPrice={eventMinPrice ? Number(eventMinPrice) : null}
            maxPrice={eventMaxPrice ? Number(eventMaxPrice) : null}
            startDate={eventFrom ?? null}
            endDate={eventTo ?? null}
            minRating={eventRating ? Number(eventRating) : null}
            maxDistanceKm={eventDistance ? Number(eventDistance) : null}
            view={exploreView}
          />
        }
        placesContent={
          <PlacesTabContent
            lat={lat ?? null}
            lng={lng ?? null}
            location={safeLocation}
            categorySlug={category ?? null}
            categoryId={categoryId ? Number(categoryId) : null}
            openNow={openNow === "true"}
            minRating={rating ? Number(rating) : null}
            maxDistanceKm={distance ? Number(distance) : null}
            searchText={q ?? null}
            view={exploreView}
          />
        }
      />
    </section>
  );
}
