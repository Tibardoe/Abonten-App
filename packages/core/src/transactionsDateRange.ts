// Shared period definitions for the (attendee) Transactions page. Mirrors
// organizerDashboardDateRange.ts's UTC-boundary technique: Ghana
// (Africa/Accra) is UTC+0 year-round with no DST, so a UTC calendar-day/
// month boundary IS the Ghana local boundary — no timezone library needed.
// No comparison ("previous period") window here — unlike the organizer
// dashboard, this page's stat tiles have no trend/vs-previous requirement.

export type TransactionPeriod =
  | "today"
  | "thisMonth"
  | "lastMonth"
  | "last3Months"
  | "all";

export interface TransactionPeriodRange {
  start: Date | null;
  end: Date | null;
}

export function getTransactionPeriodRange(
  period: TransactionPeriod,
  now: Date = new Date(),
): TransactionPeriodRange {
  switch (period) {
    case "today": {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      return { start, end: now };
    }
    case "thisMonth": {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      return { start, end: now };
    }
    case "lastMonth": {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      );
      const end = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1,
      );
      return { start, end };
    }
    case "last3Months": {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1),
      );
      return { start, end: now };
    }
    case "all":
      return { start: null, end: null };
  }
}

export const TRANSACTION_PERIOD_LABELS: Record<TransactionPeriod, string> = {
  today: "Today",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  last3Months: "Last 3 Months",
  all: "All Time",
};
