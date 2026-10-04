import { getExploreEventSections } from "@/actions/getExploreEventSections";
import { getNearByEvents } from "@/actions/getNearByEvents";
import LocationUnavailable from "@/components/molecules/LocationUnavailable";
import EventsSlider from "@/components/organisms/EventsSlider";
import FeaturedEventsCarousel from "@/components/organisms/FeaturedEventsCarousel";
import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import AreaCoverageNotice from "@/events/organisms/AreaCoverageNotice";
import { languageAlternates } from "@/i18n/alternates";
import { geocodeAddress } from "@/utils/geocodeServerSide";
import { getFeaturedEvents } from "@abonten/core/dailyEventCache";
import { EMPTY_EVENT_FILTERS } from "@abonten/core/exploreFilters";
import { undoSlug } from "@abonten/core/geerateSlug";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import AllEventsList from "./AllEventsList";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ location: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("events");

  const { location } = await params;
  const label = undoSlug(decodeURIComponent(location));
  return {
    title: t("eventsIn", { label: label }),
    description: t("upcomingEventsInWhatIsHappening", { label: label }),
    alternates: languageAlternates(
      `/events/location/${location}`,
      await getLocale(),
    ),
  };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page({
  params,
  searchParams,
}: {
  params: Promise<{ location: string }>;
  searchParams: Promise<{ lat?: string; lng?: string; joinWaitlist?: string }>;
}) {
  const t = await getTranslations("events");

  const { location } = await params;
  const { lat: latParam, lng: lngParam, joinWaitlist } = await searchParams;

  const safeLocation = location ?? "";

  // When the browser already gave us coordinates (e.g. the landing page's
  // "use my current location" flow), skip re-geocoding the slug text.
  const coordsFromQuery =
    latParam &&
    lngParam &&
    Number.isFinite(Number(latParam)) &&
    Number.isFinite(Number(lngParam))
      ? { lat: Number(latParam), lng: Number(lngParam) }
      : null;

  const { lat, lng } = coordsFromQuery ?? (await geocodeAddress(safeLocation));

  // Google could not resolve the slug (unknown address, or the lookup timed
  // out). Querying the discovery RPCs with null coordinates returns nothing
  // and reads as an empty city; say what actually happened instead.
  if (lat === null || lng === null) {
    return (
      <LocationUnavailable place={undoSlug(decodeURIComponent(safeLocation))} />
    );
  }

  // The rows (Featured, Around You, top-rated organizers, today / this week
  // / this month) come from one call that takes each from every event in
  // the area; "All Events" below pages through the same area, soonest
  // first.
  const [eventsWithinLocation, sectionsResult] = await Promise.all([
    getNearByEvents(lat, lng, 10000),
    getExploreEventSections({ lat, lng, filters: EMPTY_EVENT_FILTERS }),
  ]);
  const sections = sectionsResult.data;

  // Which paid placements show, and which leads, rotates daily.
  const featuredEvents = getFeaturedEvents(sections.featured, safeLocation);

  // Bound before the closure: a hoisted function declaration is analysed
  // without the null guard above, so the narrowed values are captured here.
  const originLat: number = lat;
  const originLng: number = lng;

  async function fetchAllEventsPage(cursor: string | null) {
    "use server";
    return getNearByEvents(originLat, originLng, 10000, { cursor });
  }

  const allEventsEmptyState = (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-5 px-4 text-center">
      <div className="max-w-md mx-auto">
        <div className="relative w-64 h-64 mx-auto mb-8">
          <img
            src="/assets/images/notFound.jpg"
            alt={t("noEventsFound")}
            className="w-full h-full object-contain opacity-90"
          />
        </div>

        <h2 className="text-2xl font-medium text-muted-foreground mb-1">
          {t("noEventsFound2")}
        </h2>

        <p className="text-muted-foreground text-sm mb-6 max-w-md">
          {t("weCouldnTFindAnyEvents")}
        </p>
      </div>
    </div>
  );

  return (
    <section className="space-y-2">
      <LocationAndFilterSection />
      {/* "Abonten isn't in Kumasi yet", where it hasn't launched. */}
      <Suspense fallback={null}>
        <AreaCoverageNotice
          lat={lat}
          lng={lng}
          location={safeLocation}
          autoJoin={joinWaitlist === "1"}
        />
      </Suspense>

      {eventsWithinLocation.data?.length ? (
        <>
          <FeaturedEventsCarousel events={featuredEvents} />

          <EventsSlider
            heading={t("aroundYou")}
            events={sections.aroundYou}
            urlPath={`location/${safeLocation}/explore/around-you`}
          />

          <EventsSlider
            heading={t("topRatedOrganizers")}
            events={sections.topRatedOrganizers}
            urlPath={`location/${safeLocation}/explore/top-rated-organizers`}
          />

          <EventsSlider
            heading={t("happeningToday")}
            events={sections.happeningToday}
            urlPath={`location/${safeLocation}/explore/happening-today`}
          />

          <EventsSlider
            heading={t("happeningThisWeek")}
            events={sections.happeningThisWeek}
            urlPath={`location/${safeLocation}/explore/happening-this-week`}
          />

          <EventsSlider
            heading={t("happeningThisMonth")}
            events={sections.happeningThisMonth}
            urlPath={`location/${safeLocation}/explore/happening-this-month`}
          />

          <div className="mb-5">
            <h2 className="text-lg font-medium">{t("allEvents")}</h2>

            <AllEventsList
              key={`${lat}-${lng}`}
              queryKey={["events", "nearby", lat, lng, 10000]}
              initialPage={eventsWithinLocation}
              fetchPage={fetchAllEventsPage}
              emptyState={allEventsEmptyState}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[60vh] py-5 px-4 text-center">
          <div className="max-w-md mx-auto">
            <div className="relative w-64 h-64 mx-auto mb-8">
              <img
                src="/assets/images/notFound.jpg"
                alt={t("noEventsFound")}
                className="w-full h-full object-contain opacity-90"
              />
            </div>

            <h2 className="text-2xl font-medium text-muted-foreground mb-1">
              {t("noEventsFound2")}
            </h2>

            <p className="text-muted-foreground text-sm mb-6 max-w-md">
              {t("weCouldnTFindAnyEvents")}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
