import { cn } from "@/components/ui";
import Link from "next/link";

// Module tabs for Field Ops. Phase 6 adds Content here.
const TABS = [
  { href: "/field-ops", label: "Overview" },
  { href: "/field-ops/campaigns", label: "Campaigns" },
  { href: "/field-ops/onboardings", label: "Onboardings" },
  { href: "/field-ops/review", label: "Review queue" },
  { href: "/field-ops/commissions", label: "Commissions" },
  { href: "/field-ops/payouts", label: "Payouts" },
  { href: "/field-ops/regions", label: "Regions & territories" },
  { href: "/field-ops/rules", label: "Commission rules" },
  { href: "/field-ops/settings", label: "Settings" },
];

export function FieldOpsTabs({ active }: { active: string }) {
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
