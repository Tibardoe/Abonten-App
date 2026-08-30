import CategoryChipsRow from "@/components/molecules/CategoryChipsRow";
import { eventCategoriesAndTypes } from "@/data/eventCategoriesAndTypes";

// Horizontal category-pill row for the Explore page's Events tab — mirrors
// PlaceCategoryChips.tsx's UX via the shared CategoryChipsRow, but sources
// its options from the static eventCategoriesAndTypes list, the single
// authoritative source also used by the Event Filter modal (CategoryFilter)
// and the Event Upload form — no event_category DB table exists, unlike
// Places' place_category table. Uses a dedicated `eventCategory` query
// param — deliberately NOT `category`, which Places already owns (a
// place-category slug) — so filtering one tab by category and then
// client-side-switching to the other tab (ExploreTabs only replaces
// `tab=`, both tab contents are pre-rendered once per request) can never
// leak one tab's category value into the other's filter.
export default function EventCategoryChips({
  location,
  selectedCategory,
}: {
  location: string;
  selectedCategory: string | null;
}) {
  const basePath = `/explore/${location}?tab=events`;

  return (
    <CategoryChipsRow
      allHref={basePath}
      allSelected={!selectedCategory}
      items={eventCategoriesAndTypes.map(({ category }) => ({
        key: category,
        label: category,
        href: `${basePath}&eventCategory=${encodeURIComponent(category)}`,
        selected: selectedCategory === category,
      }))}
    />
  );
}
