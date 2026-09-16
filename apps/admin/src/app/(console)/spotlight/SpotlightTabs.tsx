import { cn } from "@/components/ui";
import Link from "next/link";

const TABS = [
  { href: "/spotlight", label: "Overview" },
  { href: "/spotlight/posts", label: "Posts" },
  { href: "/spotlight/comments", label: "Comments" },
  { href: "/spotlight/campaigns", label: "Promotions" },
  { href: "/spotlight/settings", label: "Programme settings" },
];

export function SpotlightTabs({ active }: { active: string }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-border pb-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={cn(
            "rounded px-3 py-1.5 text-xs",
            active === t.href
              ? "bg-primary text-primary-foreground"
              : "border border-border hover:bg-muted",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
