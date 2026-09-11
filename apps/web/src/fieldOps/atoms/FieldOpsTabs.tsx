"use client";

import { cn } from "@/components/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const MEMBER_TABS = [
  { href: "/field", label: "Today" },
  { href: "/field/assignments", label: "Assignments" },
];

const LEAD_TABS = [
  { href: "/field/lead", label: "Dashboard" },
  { href: "/field/lead/territories", label: "Territories" },
  { href: "/field/lead/assignments", label: "Assignments" },
  { href: "/field/lead/team", label: "Team" },
  { href: "/field/lead/announce", label: "Announce" },
];

/** Sub-navigation for the /field area; leads see their planning tabs. */
export default function FieldOpsTabs({ isLead }: { isLead: boolean }) {
  const pathname = usePathname();
  const tabs = isLead ? LEAD_TABS : MEMBER_TABS;
  return (
    <nav
      aria-label="Field work sections"
      className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px"
    >
      {tabs.map((t) => {
        const active =
          t.href === "/field" || t.href === "/field/lead"
            ? pathname === t.href
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
