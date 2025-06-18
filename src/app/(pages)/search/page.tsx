import { getQueriedEvents } from "@/actions/getQueriedEvents";
import EventCard from "@/components/molecules/EventCard";
import FilterSearchBar from "@/components/molecules/FilterSearchBar";
import type { UserPostType } from "@/types/postsType";
import { parseFilters } from "@/utils/parseFilterModalQueries";

export default async function page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const queryParams = await searchParams;

  const { category, type } = queryParams;

  const {
    minPrice,
    maxPrice,
    minRating,
    maxDistanceKm,
    startDate,
    endDate,
    lat,
    lng,
  } = parseFilters(queryParams);

  const events = await getQueriedEvents({
    minPrice,
    maxPrice,
    minRating,
    maxDistanceKm,
    lat,
    lng,
    startDate,
    endDate,
    category,
    type,
  });

  // Helper to format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-5">
      <FilterSearchBar />

      <div className="flex flex-wrap gap-3">
        {/* Render Price */}
        {queryParams.price && (
          <span className="bg-slate-100 rounded-lg p-3 flex justify-center items-center">
            {queryParams.price}
          </span>
        )}

        {/* Render Category */}
        {queryParams.category && (
          <span className="bg-slate-100 rounded-lg p-3 flex justify-center items-center">
            {queryParams.category}
          </span>
        )}

        {/* Render Types (split by comma) */}
        {queryParams.types
          ?.toString()
          .split(",")
          .map((type: string, _index: number) => (
            <span
              key={`type-${type}`}
              className="bg-slate-100 rounded-lg p-3 flex justify-center items-center"
            >
              {type}
            </span>
          ))}

        {/* Render Combined From and To Dates */}
        {queryParams.from && queryParams.to && (
          <span className="bg-slate-100 rounded-lg p-3 flex justify-center items-center">
            {`${formatDate(queryParams.from.toString())} - ${formatDate(
              queryParams.to.toString(),
            )}`}
          </span>
        )}

        {/* Render Rating */}
        {queryParams.rating && (
          <span className="bg-slate-100 rounded-lg p-3 flex justify-center items-center">
            {queryParams.rating}
          </span>
        )}

        {/* Render Distance */}
        {queryParams.distance && (
          <span className="bg-slate-100 rounded-lg p-3 flex justify-center items-center">
            {queryParams.distance}
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
              attendance_count={event.attendance_count}
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
              No results
            </h2>

            <p className="text-gray-600 mb-6 max-w-md text-opacity-30">
              We couldn’t find any events for your queried data. Try adjusting
              your search queries.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
