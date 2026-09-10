import { cn } from "@/components/ui";
import Link from "next/link";

const TABS = [
  { href: "/rewards", label: "Overview" },
  { href: "/rewards/accounts", label: "Credit accounts" },
  { href: "/rewards/settings", label: "Program settings" },
];

export function RewardsTabs({ active }: { active: string }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-border pb-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
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
