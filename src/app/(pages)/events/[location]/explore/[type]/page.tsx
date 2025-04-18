import { getFilteredEvents } from "@/actions/getFilteredEvents";
import EventCard from "@/components/molecules/EventCard";
import type { UserPostType } from "@/types/postsType";

export default async function page({
  params,
}: {
  params: Promise<{ location: string; type: string }>;
}) {
  const { location, type } = await params;

  const validFilters = [
    "happening-today",
    "happening-this-week",
    "happening-this-month",
    "top-rated-organizers",
    "around-you",
    "category",
  ] as const;

  type FilterType = (typeof validFilters)[number];

  if (!validFilters.includes(type as FilterType)) {
    throw new Error("Invalid heading provided");
  }

  const safeLocation = location ?? "";

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(
    `${baseUrl}/api/geocode?address=${encodeURIComponent(safeLocation)}`,
  );

  const { lat, lng } = await res.json();

  const urlPath = type
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const events: UserPostType[] = await getFilteredEvents({
    lat: lat,
    lng: lng,
    filter: type as FilterType,
    radius: 10,
  });

  return (
    <div className="space-y-3">
      <h1 className="font-bold text-xl">{urlPath}</h1>

      {events.length ? (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 overflow-x-scroll scrollbar-hide gap-2">
          {events.map((event) => (
            <EventCard
              key={event.title}
              title={event.title}
              flyer_public_id={event.flyer_public_id}
              flyer_version={event.flyer_version}
              address={event.address}
              starts_at={event.starts_at}
              ends_at={event.ends_at}
              price={event.price}
              created_at={event.created_at}
            />
          ))}
        </ul>
      ) : (
        <div className="w-full h-[500] flex flex-col justify-center items-center">
          <h1 className="font-bold text-lg md:text-xl">No events found</h1>
          <p>Try other categories</p>
        </div>
      )}
    </div>
  );
}
