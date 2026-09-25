import { cn } from "@/components/ui";
import Link from "next/link";

const TABS = [
  { href: "/markets", label: "Countries" },
  { href: "/markets/flags", label: "Feature flags" },
  { href: "/markets/rates", label: "Exchange rates" },
];

export function MarketsTabs({ active }: { active: string }) {
  return (
    <nav
      className="mb-4 flex gap-1 border-b border-border"
      aria-label="Markets sections"
    >
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm",
            active === t.href
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          aria-current={active === t.href ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
