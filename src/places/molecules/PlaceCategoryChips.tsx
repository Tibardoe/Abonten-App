import CategoryChipsRow from "@/components/molecules/CategoryChipsRow";
import type { PlaceCategory } from "@/types/placeType";

// Horizontal row of category pills for the Explore page's Places tab. Each
// chip links back to the same /explore/[location] page with
// "?tab=places&category={slug}" set — "All Places" below reads that same
// `category` search param (see PlacesTabContent.tsx), so this never adds a
// filter control that doesn't actually filter anything.
export default function PlaceCategoryChips({
  categories,
  location,
  selectedSlug,
}: {
  categories: PlaceCategory[];
  location: string;
  selectedSlug: string | null;
}) {
  const basePath = `/explore/${location}?tab=places`;

  return (
    <CategoryChipsRow
      allHref={basePath}
      allSelected={!selectedSlug}
      items={categories.map((category) => ({
        key: String(category.id),
        label: category.name,
        href: `${basePath}&category=${category.slug}`,
        selected: selectedSlug === category.slug,
      }))}
    />
  );
}
