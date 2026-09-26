// Shared period definitions for the (attendee) Transactions page. Days and
// months start at midnight in the viewer's zone (their browser or phone,
// else their market's zone); without one, UTC — Ghana's calendar too.
// No comparison ("previous period") window here — unlike the organizer
// dashboard, this page's stat tiles have no trend/vs-previous requirement.

import { startOfDayInZone, startOfMonthInZone } from "./time/timeZone";

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
  timeZone = "UTC",
): TransactionPeriodRange {
  switch (period) {
    case "today":
      return { start: startOfDayInZone(now, timeZone), end: now };
    case "thisMonth":
      return { start: startOfMonthInZone(now, timeZone), end: now };
    case "lastMonth": {
      const start = startOfMonthInZone(now, timeZone, -1);
      const end = new Date(startOfMonthInZone(now, timeZone).getTime() - 1);
      return { start, end };
    }
    case "last3Months":
      return { start: startOfMonthInZone(now, timeZone, -2), end: now };
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
