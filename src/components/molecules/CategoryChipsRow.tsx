import { cn } from "@/components/lib/utils";
import Link from "next/link";

export type CategoryChipItem = {
  key: string;
  label: string;
  href: string;
  selected: boolean;
};

// Shared horizontal category-pill row for the Explore page's Places and
// Events tabs. Pure presentational: each domain resolves its own category
// source (DB table for Places, static list for Events) into `items` before
// calling this, so the chip markup/active-state styling lives in exactly
// one place instead of being copy-pasted per domain.
export default function CategoryChipsRow({
  allHref,
  allSelected,
  items,
}: {
  allHref: string;
  allSelected: boolean;
  items: CategoryChipItem[];
}) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
      <Link
        href={allHref}
        scroll={false}
        className={cn(
          "shrink-0 px-3.5 py-1.5 rounded-full text-sm border border-border transition-colors",
          allSelected
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-muted text-muted-foreground hover:bg-accent",
        )}
      >
        All
      </Link>

      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          scroll={false}
          className={cn(
            "shrink-0 px-3.5 py-1.5 rounded-full text-sm border border-border transition-colors",
            item.selected
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted text-muted-foreground hover:bg-accent",
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
