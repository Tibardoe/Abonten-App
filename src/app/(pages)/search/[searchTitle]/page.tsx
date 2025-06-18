import { getQueriedEvents } from "@/actions/getQueriedEvents";
import PostButton from "@/components/atoms/PostButton";
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
          <span className="bg-slate-100 rounded-lg p-3 flex justify-center items-center">
            {formattedSearchTitle}
          </span>
        )}
      </div>

      {events.QueriedData.length ? (
        <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5">
          {events.QueriedData.map((event: UserPostType) => (
            <EventCard
              key={event.title}
              id={event.id}
              title={event.title}
              flyer_public_id={event.flyer_public_id}
              flyer_version={event.flyer_version}
              address={event.address}
              event_code={event.event_code}
              starts_at={event.starts_at}
              ends_at={event.ends_at}
              organizer_id={event.organizer_id}
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
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-4 text-center">
          <div className="max-w-md mx-auto">
            <div className="relative w-64 h-64 mx-auto mb-8">
              <img
                src="/assets/images/notFound.jpg"
                alt="No events found"
                className="w-full h-full object-contain opacity-90"
              />
            </div>

            <h2 className="text-2xl font-semibold text-gray-800 mb-2 text-opacity-30">
              No results for {formattedSearchTitle}
            </h2>

            <p className="text-gray-600 mb-6 max-w-md text-opacity-30">
              We couldn’t find any events for {formattedSearchTitle}. Try
              adjusting your search input.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
