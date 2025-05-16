import { getQueriedEvents } from "@/actions/getQueriedEvents";
import EventCard from "@/components/molecules/EventCard";
import FilterSearchBar from "@/components/molecules/FilterSearchBar";
import type { UserPostType } from "@/types/postsType";
import { undoSlug } from "@/utils/geerateSlug";

export default async function page({
  params,
}: {
  params: Promise<{ searchTitle: string }>;
}) {
  const { searchTitle } = await params;

  const formattedSearchTitle = undoSlug(searchTitle);

  const events = await getQueriedEvents({ searchText: formattedSearchTitle });
  return (
    <div className="space-y-5">
      <FilterSearchBar />

      <div className="flex flex-wrap gap-3">
        {/* Render Price */}
        {formattedSearchTitle && (
          <span className="bg-black bg-opacity-5 rounded-lg p-3 flex justify-center items-center">
            {formattedSearchTitle}
          </span>
        )}
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5">
        {events.QueriedData.map((event: UserPostType) => (
          <EventCard
            key={event.title}
            id={event.id}
            title={event.title}
            flyer_public_id={event.flyer_public_id}
            flyer_version={event.flyer_version}
            address={event.address}
            starts_at={event.starts_at}
            ends_at={event.ends_at}
            event_dates={event.event_dates}
            minTicket={event.minTicket}
            created_at={event.created_at}
            capacity={event.capacity}
            min_price={event.min_price}
            currency={event.currency}
            attendanceCount={event.attendanceCount}
          />
        ))}
      </ul>
    </div>
  );
}
