"use client";

import { cn } from "@/components/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FINANCES_NAV_ITEMS } from "../financesNavItems";

// Horizontal pill tabs on mobile, matching DashboardPeriodFilter.tsx's
// exact scroll/pill styling, since there's no room for a persistent
// sidebar at that width.
export default function FinancesMobileTabs() {
  const pathname = usePathname();

  return (
    <div
      className="flex gap-2 overflow-x-scroll lg:hidden"
      role="tablist"
      aria-label="Finances section"
    >
      {FINANCES_NAV_ITEMS.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors",
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
