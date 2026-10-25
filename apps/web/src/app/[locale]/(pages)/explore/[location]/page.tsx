import JsonLd from "@/components/atoms/JsonLd";
import RememberExploreArea from "@/components/atoms/RememberExploreArea";
import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import AreaCoverageNotice from "@/events/organisms/AreaCoverageNotice";
import EventsTabContent from "@/events/organisms/EventsTabContent";
import { languageAlternates } from "@/i18n/alternates";
import { isExploreTab } from "@/places/exploreTab";
import ExploreTabs from "@/places/organisms/ExploreTabs";
import PlacesTabContent from "@/places/organisms/PlacesTabContent";
import AccountSetupReminder from "@/settings/organisms/AccountSetupReminder";
import { geocodeAddress } from "@/utils/geocodeServerSide";
import { indexedCityForSlug } from "@/utils/searchIndexing";
import WeeklyTeaser from "@/weekly/organisms/WeeklyTeaser";
import { undoSlug } from "@abonten/core/geerateSlug";
import { breadcrumbJsonLd, jsonLdGraph } from "@abonten/core/seo/jsonLd";
import { cityPath } from "@abonten/core/seo/paths";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense, cache } from "react";

// The city a /explore/<slug> address names, when it is a launched city of
// a live market; anything else typed after /explore/ (a street, "current
// location") is a working page but not one to show in search results.
const cityForSlug = cache((location: string) =>
  indexedCityForSlug(decodeURIComponent(location)),
);

// One canonical URL per location: the filter, tab and coordinate query
// parameters change what is shown but not what the page is about.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ location: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("explore");

  const { location } = await params;
  const city = await cityForSlug(location);
  const label = city?.name ?? undoSlug(decodeURIComponent(location));
  return {
    title: t("eventsAndPlacesIn", { label: label }),
    description: t("discoverUpcomingEventsRestaurantsNightlifeAnd", {
      label: label,
    }),
    alternates: languageAlternates(
      city ? cityPath(city.slug) : `/explore/${location}`,
      await getLocale(),
    ),
    ...(city ? {} : { robots: { index: false, follow: true } }),
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
    joinWaitlist?: string;
  }>;
}) {
  const t = await getTranslations("explore");

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
    joinWaitlist,
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
  const [city, tn] = await Promise.all([
    cityForSlug(safeLocation),
    getTranslations("navigation"),
  ]);

  return (
    <section className="space-y-2">
      {/* A launched city's page says which city it is and what is in it,
          for the people and the search engines that arrive here first. */}
      {city ? (
        <>
          <JsonLd
            data={jsonLdGraph([
              breadcrumbJsonLd([
                { name: tn("home"), path: "/" },
                { name: city.name, path: cityPath(city.slug) },
              ]),
            ])}
          />
          <h1 className="text-xl md:text-2xl font-bold">
            {t("eventsAndPlacesIn", { label: city.name })}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground text-pretty md:text-base">
            {t("cityIntro", { city: city.name })}
          </p>
        </>
      ) : (
        <h1 className="text-xl md:text-2xl font-bold">{t("explore")}</h1>
      )}

      <LocationAndFilterSection />

      {/* "Abonten isn't in Kumasi yet", where it hasn't launched. Streams in
          without holding up the page; nothing below it is hidden. */}
      <Suspense fallback={null}>
        <AreaCoverageNotice
          lat={lat ?? null}
          lng={lng ?? null}
          location={safeLocation}
          autoJoin={joinWaitlist === "1"}
        />
      </Suspense>

      {/* This becomes the area "Explore" and "Home" return to. */}
      <Suspense fallback={null}>
        <RememberExploreArea />
      </Suspense>

      {/* Signed-in, setup unfinished, not put away recently. */}
      <AccountSetupReminder className="my-3" />

      {/* Abonten Weekly for this area, when it is on for the visitor and this
          week's edition is out. Streams in without holding up the page. */}
      <Suspense fallback={null}>
        <WeeklyTeaser lat={lat ?? null} lng={lng ?? null} />
      </Suspense>

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
