// Shared period definitions for the (attendee) Transactions page. Days and
// months start at midnight in the viewer's zone (their browser or phone,
// else their market's zone); without one, UTC — Ghana's calendar too.
// No comparison ("previous period") window here — unlike the organizer
// dashboard, this page's stat tiles have no trend/vs-previous requirement.

import type { CoreTranslator } from "./i18n/translator";
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

export const TRANSACTION_PERIODS: readonly TransactionPeriod[] = [
  "today",
  "thisMonth",
  "lastMonth",
  "last3Months",
  "all",
] as const;

/** Words live under `periods.transactions.*` of the core namespace. */
export function transactionPeriodLabel(
  t: CoreTranslator,
  period: TransactionPeriod,
): string {
  return t(`periods.transactions.${period}`);
}
