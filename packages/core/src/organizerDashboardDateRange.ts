// Shared period definitions for the Organizer Dashboard. "Today" starts at
// midnight in the viewer's zone (their browser or phone, else their market's
// zone); callers pass it. Without one it is UTC, which is also Ghana's
// calendar (Africa/Accra is UTC+0 all year).

import type { CoreTranslator } from "./i18n/translator";
import { startOfDayInZone } from "./time/timeZone";

export type DashboardPeriod = "today" | "7d" | "30d" | "all";
export type DashboardBucket = "hour" | "day" | "month";

export interface DashboardPeriodRange {
  start: Date | null;
  end: Date | null;
  prevStart: Date | null;
  prevEnd: Date | null;
  bucket: DashboardBucket;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves a selected period into the current window, the comparison
 * ("previous") window, and the sales-timeline bucket granularity.
 *
 * Previous-period definitions (see CLAUDE.md Phase 5 / implementation
 * report for the rationale):
 * - today: compared against the SAME elapsed clock-time yesterday, not a
 *   full previous day — a partial "today" should never be unfairly
 *   compared against a complete "yesterday".
 * - 7d/30d: a rolling window of equal length immediately preceding the
 *   current one.
 * - all: no previous period at all (both null) — "All Time" has no
 *   meaningful prior equivalent, so callers must render "no comparison"
 *   rather than fabricate a percentage.
 */
export function getDashboardPeriodRange(
  period: DashboardPeriod,
  now: Date = new Date(),
  timeZone = "UTC",
): DashboardPeriodRange {
  switch (period) {
    case "today": {
      const startOfToday = startOfDayInZone(now, timeZone);
      const elapsed = now.getTime() - startOfToday.getTime();
      // The day before may be 23 or 25 hours long where clocks change.
      const startOfYesterday = startOfDayInZone(
        new Date(startOfToday.getTime() - 1),
        timeZone,
      );

      return {
        start: startOfToday,
        end: now,
        prevStart: startOfYesterday,
        prevEnd: new Date(startOfYesterday.getTime() + elapsed),
        bucket: "hour",
      };
    }
    case "7d": {
      const start = new Date(now.getTime() - 7 * DAY_MS);
      return {
        start,
        end: now,
        prevStart: new Date(now.getTime() - 14 * DAY_MS),
        prevEnd: start,
        bucket: "day",
      };
    }
    case "30d": {
      const start = new Date(now.getTime() - 30 * DAY_MS);
      return {
        start,
        end: now,
        prevStart: new Date(now.getTime() - 60 * DAY_MS),
        prevEnd: start,
        bucket: "day",
      };
    }
    case "all":
      return {
        start: null,
        end: null,
        prevStart: null,
        prevEnd: null,
        bucket: "month",
      };
  }
}

export const DASHBOARD_PERIODS: readonly DashboardPeriod[] = [
  "today",
  "7d",
  "30d",
  "all",
] as const;

/** Words live under `periods.*` of the core namespace. */
export function dashboardPeriodLabel(
  t: CoreTranslator,
  period: DashboardPeriod,
): string {
  return t(`periods.dashboard.${period}`);
}

/** "vs yesterday" … — null for All time, which has no prior equivalent. */
export function dashboardPeriodComparisonLabel(
  t: CoreTranslator,
  period: DashboardPeriod,
): string | null {
  return period === "all" ? null : t(`periods.comparison.${period}`);
}
