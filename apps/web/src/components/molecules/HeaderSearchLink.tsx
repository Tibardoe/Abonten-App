"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RiSearchLine } from "react-icons/ri";

// The wide-screen way into search: shaped like a search field so it reads as
// one, but it is a link to /search, where the real field (with type-ahead,
// filters and search logging) lives. Hidden on the search page itself.
export default function HeaderSearchLink() {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  if (pathname.startsWith("/search")) return null;

  return (
    <Link
      href="/search"
      aria-label={t("search")}
      className="flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground xl:w-full xl:max-w-sm xl:justify-start xl:px-4"
    >
      <RiSearchLine aria-hidden className="shrink-0 text-lg" />
      {/* Room for the words only on the widest screens; narrower desktop
          widths get the round search button. */}
      <span aria-hidden className="hidden truncate xl:inline">
        {t("searchPlaceholder")}
      </span>
    </Link>
  );
}
