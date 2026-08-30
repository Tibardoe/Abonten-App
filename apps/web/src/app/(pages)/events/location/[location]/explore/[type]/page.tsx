import {
  type EventWindow,
  getEventsInWindow,
} from "@/actions/getEventsInWindow";
import { getNearByEvents } from "@/actions/getNearByEvents";
import type { PaginatedResult } from "@/types/pagination";
import type { UserPostType } from "@/types/postsType";
import { geocodeAddress } from "@/utils/geocodeServerSide";
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
  const { location, type } = await params;

  if (!validFilters.includes(type as FilterType)) {
    throw new Error("Invalid heading provided");
  }

  const filter = type as FilterType;
  const safeLocation = location ?? "";

  const { lat, lng } = await geocodeAddress(safeLocation);

  const urlPath = type
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

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
    // "around-you" / "top-rated-organizers" / "category": radius-only —
    // top-rated-organizers/category don't actually implement their named
    // sort/filter (pre-existing gap, unrelated to pagination), matching
    // prior behavior.
    const radius = filter === "around-you" ? 5000 : 10000;

    firstPage = await getNearByEvents(lat, lng, radius);

    fetchPage = async (cursor: string | null) => {
      "use server";
      return getNearByEvents(lat, lng, radius, { cursor });
    };
  }

  const emptyState = (
    <div className="w-full h-[500] flex flex-col justify-center items-center">
      <h1 className="font-bold text-lg md:text-xl">No events found</h1>
      <p>Try other categories</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <h1 className="font-bold text-xl">{urlPath}</h1>

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
