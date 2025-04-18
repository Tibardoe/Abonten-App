import EventCard from "@/components/molecules/EventCard";
import { allEvents } from "@/data/allEvents";

export default async function page({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;

  const events = allEvents.filter(
    (events) => events.category.toLowerCase() === category,
  );

  return (
    <div className="space-y-3">
      <h1 className="font-bold text-xl">Similar Events</h1>

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
