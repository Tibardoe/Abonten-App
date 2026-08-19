"use client";

import { cn } from "@/components/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FinancesNavItem } from "../financesNavItems";

// Same usePathname/cn active-highlight approach as
// src/settings/atoms/SettingsNavLinks.tsx, adapted for Finances' simple
// text nav (no matching custom SVG icon set exists for these sections yet).
export default function FinancesNavLinks({ item }: { item: FinancesNavItem }) {
  const pathname = usePathname();
  const isActive = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      className={cn(
        "block w-full rounded-l-full px-4 py-2 transition-colors hover:bg-accent",
        isActive
          ? "font-bold bg-accent text-accent-foreground"
          : "text-foreground",
      )}
    >
      {item.label}
    </Link>
  );
}
