import { cn } from "@/components/ui";
import Link from "next/link";

const TABS = [
  { href: "/finance", label: "Overview" },
  { href: "/finance/transactions", label: "Transactions" },
  { href: "/finance/refunds", label: "Refunds" },
  { href: "/finance/payouts", label: "Payouts" },
];

export function FinanceTabs({ active }: { active: string }) {
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
