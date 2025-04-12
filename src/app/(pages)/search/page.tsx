import EventCard from "@/components/molecules/EventCard";
import FilterSearchBar from "@/components/molecules/FilterSearchBar";
import { allEvents } from "@/data/allEvents";
import Image from "next/image";

export default async function page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const queryParams = await searchParams;

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
          .map((type: string, index: number) => (
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
        {allEvents.map((post) => (
          <EventCard
            key={post.title}
            title={post.title}
            flyerUrl={post.flyerUrl}
            location={post.location}
            start_at={post.startDate}
            end_at={post.endDate}
            timezone={post.time}
            price={post.price}
          />
        ))}
      </ul>
    </div>
  );
}
