import { getQueriedEvents } from "@/actions/getQueriedEvents";
import FilterSearchBar from "@/components/molecules/FilterSearchBar";
import NoEventsFound from "@/events/molecules/NoEventsFound";
import { undoSlug } from "@abonten/core/geerateSlug";
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

  // Same empty-state component the Explore events + filters flow uses, so
  // "nothing matched" looks and behaves the same across the app. The copy
  // stays search-specific: this is a text query with no matches, so it
  // points at the search term rather than at filters.
  const emptyState = (
    <NoEventsFound
      heading={`No results for "${formattedSearchTitle}"`}
      description="We couldn't find any events matching that search. Try a different or more general term."
      action={{ label: "Browse all events", href: "/" }}
    />
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
