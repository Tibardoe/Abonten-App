import { getQueriedEvents } from "@/actions/getQueriedEvents";
import FilterSearchBar from "@/components/molecules/FilterSearchBar";
import { parseFilters } from "@/utils/parseFilterModalQueries";
import SearchResultsList from "./SearchResultsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

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

  const filters = {
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
  };

  const firstPage = await getQueriedEvents(filters);

  async function fetchPage(cursor: string | null) {
    "use server";
    return getQueriedEvents({ ...filters, cursor });
  }

  // Helper to format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const emptyState = (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-4 text-center">
      <div className="max-w-md mx-auto">
        <div className="relative w-64 h-64 mx-auto mb-8">
          <img
            src="/assets/images/notFound.jpg"
            alt="No events found"
            className="w-full h-full object-contain opacity-90"
          />
        </div>

        <h2 className="text-2xl font-semibold text-muted-foreground mb-2">
          No results
        </h2>

        <p className="text-muted-foreground mb-6 max-w-md">
          We couldn’t find any events for your queried data. Try adjusting your
          search queries.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <FilterSearchBar />

      <div className="flex flex-wrap gap-3">
        {/* Render Price */}
        {queryParams.price && (
          <span className="bg-muted rounded-lg p-3 flex justify-center items-center">
            {queryParams.price}
          </span>
        )}

        {/* Render Category */}
        {queryParams.category && (
          <span className="bg-muted rounded-lg p-3 flex justify-center items-center">
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
              className="bg-muted rounded-lg p-3 flex justify-center items-center"
            >
              {type}
            </span>
          ))}

        {/* Render Combined From and To Dates */}
        {queryParams.from && queryParams.to && (
          <span className="bg-muted rounded-lg p-3 flex justify-center items-center">
            {`${formatDate(queryParams.from.toString())} - ${formatDate(
              queryParams.to.toString(),
            )}`}
          </span>
        )}

        {/* Render Rating */}
        {queryParams.rating && (
          <span className="bg-muted rounded-lg p-3 flex justify-center items-center">
            {queryParams.rating}
          </span>
        )}

        {/* Render Distance */}
        {queryParams.distance && (
          <span className="bg-muted rounded-lg p-3 flex justify-center items-center">
            {queryParams.distance}
          </span>
        )}
      </div>

      <SearchResultsList
        key={JSON.stringify(filters)}
        queryKey={["events", "search", filters]}
        initialPage={firstPage}
        fetchPage={fetchPage}
        emptyState={emptyState}
      />
    </div>
  );
}
