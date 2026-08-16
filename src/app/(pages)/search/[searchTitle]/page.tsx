import { getQueriedEvents } from "@/actions/getQueriedEvents";
import FilterSearchBar from "@/components/molecules/FilterSearchBar";
import { undoSlug } from "@/utils/geerateSlug";
import SearchTitleResultsList from "./SearchTitleResultsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// This route only depends on the [searchTitle] segment (no query-string
// filters), and getQueriedEvents is now a public, cookie-free read, so it
// can be statically rendered and revalidated periodically (ISR).
export const revalidate = 60;

export default async function page({
  params,
}: {
  params: Promise<{ searchTitle: string }>;
}) {
  const { searchTitle } = await params;

  const formattedSearchTitle = undoSlug(searchTitle);
  const filters = { searchText: formattedSearchTitle };

  const firstPage = await getQueriedEvents(filters);

  async function fetchPage(cursor: string | null) {
    "use server";
    return getQueriedEvents({ ...filters, cursor });
  }

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
          No results for {formattedSearchTitle}
        </h2>

        <p className="text-muted-foreground mb-6 max-w-md">
          We couldn’t find any events for {formattedSearchTitle}. Try adjusting
          your search input.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <FilterSearchBar />

      <div className="flex flex-wrap gap-3">
        {/* Render Price */}
        {formattedSearchTitle && (
          <span className="bg-muted rounded-lg p-3 flex justify-center items-center">
            {formattedSearchTitle}
          </span>
        )}
      </div>

      <SearchTitleResultsList
        key={formattedSearchTitle}
        queryKey={["events", "search-title", formattedSearchTitle]}
        initialPage={firstPage}
        fetchPage={fetchPage}
        emptyState={emptyState}
      />
    </div>
  );
}
