import { cn } from "@/components/lib/utils";
import { useTranslations } from "next-intl";
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
//
// The chips are not prefetched: each is the same page with another filter,
// so prefetching the row asked the server to start twenty versions of the
// page for every visitor who opened Explore, to save a moment for the one
// chip in twenty that gets tapped. The page shows its loading state on tap.
export default function CategoryChipsRow({
  allHref,
  allSelected,
  items,
}: {
  allHref: string;
  allSelected: boolean;
  items: CategoryChipItem[];
}) {
  const t = useTranslations("common");

  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto scroll-smooth scrollbar-hide snap-x snap-proximity pt-1 pb-2",
        "[mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]",
        "[-webkit-mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]",
      )}
    >
      <Link
        href={allHref}
        scroll={false}
        prefetch={false}
        className={cn(
          "shrink-0 snap-start px-4 py-2 rounded-full text-sm border border-border transition-colors",
          allSelected
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-muted text-muted-foreground hover:bg-accent",
        )}
      >
        {t("all")}
      </Link>

      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          scroll={false}
          prefetch={false}
          className={cn(
            "shrink-0 snap-start px-4 py-2 rounded-full text-sm border border-border transition-colors",
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
