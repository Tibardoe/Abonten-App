import { cn } from "@/components/lib/utils";
import type { PlaceCategory } from "@/types/placeType";
import Link from "next/link";

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
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
      <Link
        href={basePath}
        className={cn(
          "shrink-0 px-3.5 py-1.5 rounded-full text-sm border border-border transition-colors",
          !selectedSlug
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-muted text-muted-foreground hover:bg-accent",
        )}
      >
        All
      </Link>

      {categories.map((category) => (
        <Link
          key={category.id}
          href={`${basePath}&category=${category.slug}`}
          className={cn(
            "shrink-0 px-3.5 py-1.5 rounded-full text-sm border border-border transition-colors",
            selectedSlug === category.slug
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted text-muted-foreground hover:bg-accent",
          )}
        >
          {category.name}
        </Link>
      ))}
    </div>
  );
}
