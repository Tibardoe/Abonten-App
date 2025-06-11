import { getSimilarEvents } from "@/actions/getSimilarEvents";
// import Notification from "@/components/atoms/Notification";
import EventCard from "@/components/molecules/EventCard";
import type { UserPostType } from "@/types/postsType";
import { undoSlug } from "@/utils/geerateSlug";

export default async function page({
  searchParams,
  params,
}: {
  searchParams: Promise<{ category?: string }>;
  params: Promise<{ location?: string }>;
}) {
  const { category = "" } = await searchParams;
  const { location = "" } = await params;

  const formattedCategory = undoSlug(category);

  const formattedLocation = undoSlug(location);

  const safeLocation = location ?? "";

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(
    `${baseUrl}/api/geocode?address=${encodeURIComponent(safeLocation)}`,
  );

  const { lat, lng } = await res.json();

  const response = await getSimilarEvents(
    formattedCategory,
    lng,
    lat,
    formattedLocation,
  );

  let errorMessage: string | undefined = undefined;

  if (response.status !== 200) {
    errorMessage = response.message;
    console.log(errorMessage);
  }

  const events: UserPostType[] = response.similarEvents;

  return (
    <div className="space-y-3">
      <h1 className="font-bold text-xl">Similar Events</h1>

      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 overflow-x-scroll scrollbar-hide gap-2 pb-5">
        {events?.length
          ? events.map((event) => (
              <EventCard
                key={event.title}
                title={event.title}
                id={event.id}
                event_code={event.event_code}
                flyer_public_id={event.flyer_public_id}
                flyer_version={event.flyer_version}
                address={event.address}
                starts_at={event.starts_at}
                event_dates={event.event_dates}
                ends_at={event.ends_at}
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
