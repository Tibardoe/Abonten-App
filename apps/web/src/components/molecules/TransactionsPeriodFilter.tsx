"use client";

import {
  TRANSACTION_PERIOD_LABELS,
  type TransactionPeriod,
} from "@abonten/core/transactionsDateRange";
import { cn } from "../lib/utils";

const PERIODS: TransactionPeriod[] = [
  "today",
  "thisMonth",
  "lastMonth",
  "last3Months",
  "all",
];

export default function TransactionsPeriodFilter({
  value,
  onChange,
}: {
  value: TransactionPeriod;
  onChange: (period: TransactionPeriod) => void;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-scroll md:overflow-x-hidden"
      role="tablist"
      aria-label="Transactions time period"
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
          {TRANSACTION_PERIOD_LABELS[period]}
        </button>
      ))}
    </div>
  );
}
