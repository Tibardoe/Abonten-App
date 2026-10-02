"use client";

import { cn } from "@/components/lib/utils";
import { useWeeklyProgram } from "@/hooks/useWeeklyProgram";
import { useContentProgram } from "@/spotlight/hooks/useContentProgram";
import { SPOTLIGHT_PRODUCT_NAME } from "@abonten/core/content/copy";
import { WEEKLY_PRODUCT_NAME } from "@abonten/core/weekly/copy";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

type DesktopPrimaryNavProps = {
  /** Where "Explore" goes: the visitor's own area when we know it. */
  exploreHref: string;
};

// The public destinations, shown to everyone on wide screens (signed in or
// not): the browse surfaces a visitor came for. Weekly and Spotlight appear
// only while their programmes are switched on for this visitor, the same
// rule their own nav links follow, so the admin switch still controls every
// entry point.
export default function DesktopPrimaryNav({
  exploreHref,
}: DesktopPrimaryNavProps) {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const { program: weekly } = useWeeklyProgram();
  const { program: content } = useContentProgram();

  const links = [
    {
      href: exploreHref,
      label: t("explore"),
      active:
        pathname.startsWith("/explore") ||
        (pathname.startsWith("/events") && !pathname.startsWith("/events/")),
      show: true,
    },
    {
      href: "/weekly",
      label: WEEKLY_PRODUCT_NAME,
      active: pathname.startsWith("/weekly"),
      show: weekly.enabled,
    },
    {
      href: "/spotlight",
      label: SPOTLIGHT_PRODUCT_NAME,
      active: pathname.startsWith("/spotlight"),
      show: content.spotlight,
    },
  ];

  return (
    <nav aria-label={t("primary")} className="flex items-center gap-1">
      {links
        .filter((link) => link.show)
        .map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={link.active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-medium text-sidebar-foreground/75 transition-colors hover:bg-accent hover:text-sidebar-foreground",
              link.active && "bg-accent text-sidebar-foreground",
            )}
          >
            {link.label}
          </Link>
        ))}
    </nav>
  );
}
