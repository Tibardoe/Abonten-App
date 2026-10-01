"use client";

import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { dashboardPeriodLabel } from "@abonten/core/organizerDashboardDateRange";
import { useTranslations } from "next-intl";
import { cn } from "../lib/utils";

const PERIODS: DashboardPeriod[] = ["today", "7d", "30d", "all"];

export default function DashboardPeriodFilter({
  value,
  onChange,
  ariaLabel: ariaLabelProp,
}: {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
  ariaLabel?: string;
}) {
  const t = useTranslations("common");
  const tc = useTranslations("core");
  const ariaLabel = ariaLabelProp ?? t("dashboardTimePeriod");
  return (
    <div
      className="flex gap-2 overflow-x-scroll md:overflow-x-hidden"
      role="tablist"
      aria-label={ariaLabel}
    >
      {PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          role="tab"
          aria-selected={value === period}
          onClick={() => onChange(period)}
          className={cn(
            "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors",
            value === period
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {dashboardPeriodLabel(tc, period)}
        </button>
      ))}
    </div>
  );
}
