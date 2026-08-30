import { getQueriedEvents } from "@/actions/getQueriedEvents";
import FilterSearchBar from "@/components/molecules/FilterSearchBar";
import NoEventsFound from "@/events/molecules/NoEventsFound";
import { parseFilters } from "@abonten/core/parseFilterModalQueries";
import Link from "next/link";
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

  // FilterModalPopup writes the Type selection under the plural `types` key
  // (comma-joined) -- getQueriedEvents' `type` param expects an array.
  const { category, types } = queryParams;
  const type = types
    ? types
        .toString()
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : null;

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

  // /search always carries a ?price= (even at the unfiltered 0-999
  // default, see FilterModalPopup's default branch), so it's excluded from
  // "is anything actually active" -- otherwise the chip row and "Clear all"
  // link would show up on every single visit to this page.
  const hasActiveFilters = Boolean(
    (queryParams.price && queryParams.price !== "GHS 0 - GHS 999") ||
      queryParams.category ||
      queryParams.types ||
      (queryParams.from && queryParams.to) ||
      queryParams.rating ||
      queryParams.distance,
  );

  // Reuses the Explore events/filters empty state so a filtered "no matches"
  // looks the same everywhere. Copy is filter-aware: when filters are on, it
  // nudges toward loosening them (with a one-tap clear); otherwise it's a
  // plain "nothing here" message.
  const emptyState = hasActiveFilters ? (
    <NoEventsFound
      heading="No events match these filters"
      description="Try widening your price range or date window, or removing a filter or two."
      action={{ label: "Clear all filters", href: "/search" }}
    />
  ) : (
    <NoEventsFound
      heading="No events found"
      description="We couldn't find any events to show here yet. Check back soon."
    />
  );

  return (
    <div className="space-y-5">
      <FilterSearchBar />

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Render Price */}
          {queryParams.price && queryParams.price !== "GHS 0 - GHS 999" && (
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

          <Link
            href="/search"
            className="text-sm text-primary hover:underline px-1"
          >
            Clear all
          </Link>
        </div>
      )}

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
