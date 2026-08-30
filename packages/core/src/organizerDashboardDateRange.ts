// Shared period definitions for the Organizer Dashboard. Ghana (Africa/Accra)
// is UTC+0 year-round with no DST, so a UTC calendar-day boundary IS the
// Ghana local calendar-day boundary — no timezone library needed here.

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
): DashboardPeriodRange {
  switch (period) {
    case "today": {
      const startOfToday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const elapsed = now.getTime() - startOfToday.getTime();
      const startOfYesterday = new Date(startOfToday.getTime() - DAY_MS);

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

export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: "Today",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  all: "All Time",
};

export const DASHBOARD_PERIOD_COMPARISON_LABELS: Record<
  DashboardPeriod,
  string | null
> = {
  today: "vs yesterday",
  "7d": "vs previous 7 days",
  "30d": "vs previous 30 days",
  all: null,
};
