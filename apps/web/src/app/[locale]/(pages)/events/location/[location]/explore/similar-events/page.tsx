import { getSimilarEvents } from "@/actions/getSimilarEvents";
import EventCard from "@/components/molecules/EventCard";
import { geocodeAddress } from "@/utils/geocodeServerSide";
import { resolveEventCategoryLabel } from "@abonten/core/eventCategoryLabels";
import { logger } from "@abonten/core/logger";
import type { UserPostType } from "@abonten/types/postsType";
import type { Metadata } from "next";

// Depends entirely on the ?category query: a title for the tab, no index.
export const metadata: Metadata = {
  title: "Similar events",
  robots: { index: false, follow: true },
};

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page({
  searchParams,
  params,
}: {
  searchParams: Promise<{ category?: string }>;
  params: Promise<{ location?: string }>;
}) {
  const { category = "" } = await searchParams;
  const { location = "" } = await params;

  // The slug in the URL is lossy — generateSlug strips "&" and commas, so
  // de-slugging by hand turned "Music & Concerts" into "Music Concerts",
  // which get_similar_events (it filters on lower(event_category)) matches
  // against nothing. 18 of the 19 top-level categories were affected, so
  // this page came back empty for almost every event. Resolve the slug
  // against the canonical category list instead of guessing it back.
  const formattedCategory = resolveEventCategoryLabel(category);

  const safeLocation = location ?? "";

  // const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  // const res = await fetch(
  //   `${baseUrl}/api/geocode?address=${encodeURIComponent(safeLocation)}`,
  // );

  const { lat, lng } = await geocodeAddress(safeLocation);

  // Without coordinates there is no "near here" to search; the list renders
  // its empty state rather than calling the RPC with nulls.
  const response =
    lat === null || lng === null
      ? null
      : await getSimilarEvents(formattedCategory, lng, lat);

  if (response && response.status !== 200) {
    logger.error(response.message);
  }

  const events: UserPostType[] =
    (response?.similarEvents as unknown as UserPostType[] | undefined) ?? [];

  return (
    <div className="space-y-3">
      <h1 className="font-bold text-xl">Similar Events</h1>

      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 overflow-x-scroll scrollbar-hide gap-2 pb-5">
        {events?.length
          ? events.map((event, index) => (
              <EventCard
                key={event.id}
                priority={index < 4}
                title={event.title}
                id={event.id}
                event_code={event.event_code}
                flyer_public_id={event.flyer_public_id}
                flyer_version={event.flyer_version}
                address={event.address}
                starts_at={event.starts_at}
                occurrences={event.occurrences}
                ends_at={event.ends_at}
                organizer_id={event.organizer_id}
                min_price={event.ticket_price}
                currency={event.ticket_currency ?? ""}
                created_at={event.created_at}
                attendanceCount={event.attendanceCount ?? 0}
              />
            ))
          : "No Events"}
      </ul>
    </div>
  );
}
