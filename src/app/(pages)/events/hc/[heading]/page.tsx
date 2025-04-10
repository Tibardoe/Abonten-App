import { getEvents } from "@/actions/getEvents";
import EventCard from "@/components/molecules/EventCard";

export default async function page({
  params,
}: {
  params: Promise<{ heading: string }>;
}) {
  const heading = (await params).heading;

  const urlPath = heading
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const events = await getEvents(urlPath);

  return (
    <div className="space-y-3">
      <h1 className="font-bold text-xl">{urlPath}</h1>

      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 overflow-x-scroll scrollbar-hide gap-2">
        {events.length
          ? events.map((event) => (
              <EventCard
                key={event.title}
                title={event.title}
                flyerUrl={event.flyerUrl}
                location={event.location}
                start_at={event.startDate}
                end_at={event.endDate}
                timezone={event.time}
                price={event.price}
              />
            ))
          : "No Events"}
      </ul>
    </div>
  );
}
