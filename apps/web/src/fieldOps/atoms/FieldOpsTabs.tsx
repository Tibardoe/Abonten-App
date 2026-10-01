"use client";

import { cn } from "@/components/lib/utils";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

const MEMBER_TABS = [
  { href: "/field", label: "tabs.today" },
  { href: "/field/assignments", label: "tabs.assignments" },
  { href: "/field/submissions", label: "tabs.submissions" },
  { href: "/field/earnings", label: "tabs.earnings" },
];

// Only the content creator can submit a deliverable, so only they get the
// tab -- an offline member opening it would find briefs they cannot act on.
const CONTENT_TAB = { href: "/field/content", label: "tabs.content" };

const LEAD_TABS = [
  { href: "/field/lead", label: "tabs.dashboard" },
  { href: "/field/lead/review", label: "tabs.review" },
  { href: "/field/lead/territories", label: "tabs.territories" },
  { href: "/field/lead/assignments", label: "tabs.assignments" },
  { href: "/field/lead/team", label: "tabs.team" },
  { href: "/field/lead/content", label: "tabs.content" },
  { href: "/field/lead/performance", label: "tabs.performance" },
  { href: "/field/lead/announce", label: "tabs.announce" },
];

/** Sub-navigation for the /field area; leads see their planning tabs. */
export default function FieldOpsTabs({
  isLead,
  role,
}: {
  isLead: boolean;
  role: string;
}) {
  const t = useTranslations("fieldOps");

  const pathname = usePathname();
  const tabs = isLead
    ? LEAD_TABS
    : role === "content_creator"
      ? [...MEMBER_TABS.slice(0, 3), CONTENT_TAB, ...MEMBER_TABS.slice(3)]
      : MEMBER_TABS;
  return (
    <nav
      aria-label={t("fieldWorkSections")}
      className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px"
    >
      {tabs.map((tab) => {
        const active =
          tab.href === "/field" || tab.href === "/field/lead"
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(tab.label)}
          </Link>
        );
      })}
    </nav>
  );
}
