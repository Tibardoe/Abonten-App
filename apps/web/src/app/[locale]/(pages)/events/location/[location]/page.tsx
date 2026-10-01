import getActivePromotedEventIds from "@/actions/getActivePromotedEventIds";
import { filterEventsByWindow } from "@/actions/getFilteredEvents";
import { getNearByEvents } from "@/actions/getNearByEvents";
import LocationUnavailable from "@/components/molecules/LocationUnavailable";
import EventsSlider from "@/components/organisms/EventsSlider";
import FeaturedEventsCarousel from "@/components/organisms/FeaturedEventsCarousel";
import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import AreaCoverageNotice from "@/events/organisms/AreaCoverageNotice";
import { geocodeAddress } from "@/utils/geocodeServerSide";
import { requestTimeZone } from "@/utils/requestTimeZone";
import { getFeaturedEvents } from "@abonten/core/dailyEventCache";
import { undoSlug } from "@abonten/core/geerateSlug";
import type { UserPostType } from "@abonten/types/postsType";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
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
    alternates: { canonical: `/events/location/${location}` },
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

  // "Around You" (5km) is a genuinely different dataset from the 10km
  // location-wide set, so both are fetched — but only once each. Every
  // other slider below (top-rated, today/week/month) previously re-fetched
  // "all events within 10km" from scratch per slider; they now filter the
  // one `eventsWithinLocation` fetch in memory instead.
  const [eventsWithinLocation, eventsAroundYou] = await Promise.all([
    getNearByEvents(lat, lng, 10000),
    getNearByEvents(lat, lng, 5000),
  ]);

  const aroundYou: UserPostType[] = eventsAroundYou.data || [];

  const events: UserPostType[] = eventsWithinLocation.data || [];

  const topRatedOrganizers = filterEventsByWindow(
    events,
    "top-rated-organizers",
  );
  // "Today" and "this month" on the visitor's calendar, not the server's.
  const zone = await requestTimeZone();
  const happeningToday = filterEventsByWindow(events, "happening-today", zone);
  const happeningThisWeek = filterEventsByWindow(
    events,
    "happening-this-week",
    zone,
  );
  const happeningThisMonth = filterEventsByWindow(
    events,
    "happening-this-month",
    zone,
  );

  // A paid Event Promotion (see the Promotion tab in Unified Event
  // Management) makes an event featured-eligible for its purchased period,
  // exactly like the free, self-toggled `featured` checkbox already does —
  // folded in here rather than inside getFeaturedEvents/meetsBaseEligibility
  // themselves, so every existing eligibility rule there (upcoming, not
  // sold out) keeps applying unchanged to promoted events too.
  const promotedEventIds = await getActivePromotedEventIds();
  const eventsWithPromotion = promotedEventIds.size
    ? events.map((event) =>
        promotedEventIds.has(event.id) ? { ...event, featured: true } : event,
      )
    : events;

  const featuredEvents = getFeaturedEvents(eventsWithPromotion, safeLocation);

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
            events={aroundYou || []}
            urlPath={`location/${safeLocation}/explore/around-you`}
          />

          <EventsSlider
            heading={t("topRatedOrganizers")}
            events={topRatedOrganizers}
            urlPath={`location/${safeLocation}/explore/top-rated-organizers`}
          />

          <EventsSlider
            heading={t("happeningToday")}
            events={happeningToday}
            urlPath={`location/${safeLocation}/explore/happening-today`}
          />

          <EventsSlider
            heading={t("happeningThisWeek")}
            events={happeningThisWeek}
            urlPath={`location/${safeLocation}/explore/happening-this-week`}
          />

          <EventsSlider
            heading={t("happeningThisMonth")}
            events={happeningThisMonth}
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
