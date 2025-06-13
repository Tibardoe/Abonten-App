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
          <span className="bg-black bg-opacity-5 rounded-lg p-3 flex justify-center items-center">
            {queryParams.price}
          </span>
        )}

        {/* Render Category */}
        {queryParams.category && (
          <span className="bg-black bg-opacity-5 rounded-lg p-3 flex justify-center items-center">
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
              className="bg-black bg-opacity-5 rounded-lg p-3 flex justify-center items-center"
            >
              {type}
            </span>
          ))}

        {/* Render Combined From and To Dates */}
        {queryParams.from && queryParams.to && (
          <span className="bg-black bg-opacity-5 rounded-lg p-3 flex justify-center items-center">
            {`${formatDate(queryParams.from.toString())} - ${formatDate(
              queryParams.to.toString(),
            )}`}
          </span>
        )}

        {/* Render Rating */}
        {queryParams.rating && (
          <span className="bg-black bg-opacity-5 rounded-lg p-3 flex justify-center items-center">
            {queryParams.rating}
          </span>
        )}

        {/* Render Distance */}
        {queryParams.distance && (
          <span className="bg-black bg-opacity-5 rounded-lg p-3 flex justify-center items-center">
            {queryParams.distance}
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
    </div>
  );
}
