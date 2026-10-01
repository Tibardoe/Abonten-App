import { getDiscoveryProgram } from "@/actions/discovery/getDiscoveryProgram";
import { getQueriedEvents } from "@/actions/getQueriedEvents";
import FilterSearchBar from "@/components/molecules/FilterSearchBar";
import NoEventsFound from "@/events/molecules/NoEventsFound";
import { undoSlug } from "@abonten/core/geerateSlug";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import SearchTitleResultsList from "./SearchTitleResultsList";

// The same title and indexing rule as /search: the tab says what was
// searched for, and result pages are not for search engines.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ searchTitle: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("search");
  const query = undoSlug((await params).searchTitle);
  return {
    title: query ? t("search2", { slice: query.slice(0, 60) }) : t("search"),
    robots: { index: false, follow: true },
  };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// No ISR: whether this page redirects to unified search depends on the
// visitor (the Discovery programme rolls out by audience).

export default async function page({
  params,
}: {
  params: Promise<{ searchTitle: string }>;
}) {
  const t = await getTranslations("search");

  const { searchTitle } = await params;

  const formattedSearchTitle = undoSlug(searchTitle);

  // With unified search on, old slug links land on the one search page.
  const { data: program } = await getDiscoveryProgram();
  if (program.searchV2) {
    redirect(`/search?q=${encodeURIComponent(formattedSearchTitle)}`);
  }
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
      heading={t("noResultsFor", {
        formattedSearchTitle: formattedSearchTitle,
      })}
      description={t("weCouldnTFindAnyEvents")}
      action={{ label: t("browseAllEvents"), href: "/" }}
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
