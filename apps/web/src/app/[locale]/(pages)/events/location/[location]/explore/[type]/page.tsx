import {
  type EventWindow,
  getEventsInWindow,
} from "@/actions/getEventsInWindow";
import { getNearByEvents } from "@/actions/getNearByEvents";
import LocationUnavailable from "@/components/molecules/LocationUnavailable";
import { geocodeAddress } from "@/utils/geocodeServerSide";
import { filterEventsByWindow } from "@abonten/core/eventDateWindow";
import { undoSlug } from "@abonten/core/geerateSlug";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import ExploreEventsList from "./ExploreEventsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const validFilters = [
  "happening-today",
  "happening-this-week",
  "happening-this-month",
  "top-rated-organizers",
  "around-you",
  "category",
] as const;

type FilterType = (typeof validFilters)[number];

// Keys in the `events` namespace; each takes the place name.
const FILTER_TITLE_KEYS: Record<FilterType, string> = {
  "happening-today": "eventsHappeningTodayIn",
  "happening-this-week": "eventsThisWeekIn",
  "happening-this-month": "eventsThisMonthIn",
  "top-rated-organizers": "topRatedOrganizersIn",
  "around-you": "eventsNearYouIn",
  category: "eventsByCategoryIn",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ location: string; type: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("events");

  const { location, type } = await params;
  const label = undoSlug(decodeURIComponent(location));
  const filter = (validFilters as readonly string[]).includes(type)
    ? (type as FilterType)
    : null;
  if (!filter) return { title: t("eventsIn", { label: label }) };
  return {
    title: t(FILTER_TITLE_KEYS[filter], { place: label }),
    alternates: {
      canonical: `/events/location/${location}/explore/${filter}`,
    },
    // "category" and "around-you" depend on query or device state.
    robots:
      filter === "category" || filter === "around-you"
        ? { index: false, follow: true }
        : undefined,
  };
}

const windowFilters: readonly FilterType[] = [
  "happening-today",
  "happening-this-week",
  "happening-this-month",
];

export default async function page({
  params,
}: {
  params: Promise<{ location: string; type: string }>;
}) {
  const t = await getTranslations("events");

  const { location, type } = await params;

  // A mistyped or stale link is a page that does not exist, not a failure
  // of ours: it gets the 404 page, and is not reported as an error.
  if (!validFilters.includes(type as FilterType)) notFound();

  const filter = type as FilterType;
  const safeLocation = location ?? "";

  const { lat, lng } = await geocodeAddress(safeLocation);

  // See events/location/[location]/page.tsx: no coordinates means the place
  // could not be resolved, not that nothing is on there.
  if (lat === null || lng === null) {
    return (
      <LocationUnavailable place={undoSlug(decodeURIComponent(safeLocation))} />
    );
  }

  let firstPage: PaginatedResult<UserPostType>;
  let fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<UserPostType>>;

  if (windowFilters.includes(filter)) {
    // "Happening today/this week/this month": a real server-side date-range
    // query (get_events_in_window), not the old fetch-200-then-filter-in-JS
    // approach — see getFilteredEvents.ts's filterEventsByWindow, which is
    // still used for the bounded preview sliders but not here.
    firstPage = await getEventsInWindow({
      lat,
      lng,
      radius: 10,
      window: filter as EventWindow,
    });

    fetchPage = async (cursor: string | null) => {
      "use server";
      return getEventsInWindow({
        lat,
        lng,
        radius: 10,
        window: filter as EventWindow,
        cursor,
      });
    };
  } else {
    // "around-you" / "top-rated-organizers" / "category": radius-only
    // fetches. "top-rated-organizers" additionally ranks each page by the
    // organizer rating get_nearby_events now returns — the same
    // filterEventsByWindow rule the preview slider uses — so this "see all"
    // page agrees with the slider it came from. "category" has no named
    // filter of its own (pre-existing gap, unrelated to pagination).
    const radius = filter === "around-you" ? 5000 : 10000;
    const shape = (page: PaginatedResult<UserPostType>) =>
      filter === "top-rated-organizers"
        ? {
            ...page,
            data: filterEventsByWindow(page.data, "top-rated-organizers"),
          }
        : page;

    firstPage = shape(await getNearByEvents(lat, lng, radius));

    fetchPage = async (cursor: string | null) => {
      "use server";
      return shape(await getNearByEvents(lat, lng, radius, { cursor }));
    };
  }

  const emptyState = (
    <div className="w-full h-[500] flex flex-col justify-center items-center">
      <h1 className="font-bold text-lg md:text-xl">{t("noEventsFound")}</h1>
      <p>{t("tryOtherCategories")}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <h1 className="font-bold text-xl">
        {t("exploreHeading", { filter: filter.replaceAll("-", "_") })}
      </h1>

      <ExploreEventsList
        key={`${filter}-${lat}-${lng}`}
        queryKey={["events", "window", filter, lat, lng]}
        initialPage={firstPage}
        fetchPage={fetchPage}
        emptyState={emptyState}
      />
    </div>
  );
}
