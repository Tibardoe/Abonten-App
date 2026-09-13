// One definition of "a period" for the whole admin console.
//
// Before this, four surfaces resolved their own ranges: some rolling
// (now − N × 24h, so "last 7 days" started mid-afternoon on day −7), some
// calendar-aligned, all labelled "7d"/"30d" with no dates and no comparison.
// Two pages could show different numbers for the same window and neither
// said which it meant.
//
// Rules here:
//   * Calendar-day aligned, today included. "Last 7 days" is the 6 whole
//     days before today plus today so far. An operations console has to show
//     what is happening now, and whole-day buckets keep a chart honest.
//   * Half-open [from, to): a row is in exactly one window, never both.
//   * Africa/Accra is UTC+0 all year with no DST, so a UTC day boundary IS
//     the Ghana day boundary — no timezone library needed. If Abonten ever
//     operates outside that offset this becomes a real conversion.
//   * Every range carries the equivalent previous window, so a figure can be
//     compared without each page inventing its own comparison.

import type { AdminBucket, AdminRangeKey } from "@abonten/types/adminTypes";

export type ResolvedAdminRange = {
  key: AdminRangeKey;
  /** Inclusive start, ISO. */
  from: string;
  /** Exclusive end, ISO. */
  to: string;
  /** Equivalent earlier window, or null when a comparison is meaningless. */
  prevFrom: string | null;
  prevTo: string | null;
  label: string;
  comparisonLabel: string | null;
  bucket: AdminBucket;
  /** Calendar days the window covers, today counted as one. */
  days: number;
  /** True when the window runs up to now, so its last day is incomplete. */
  isPartial: boolean;
};

const DAY_MS = 86_400_000;
const MAX_CUSTOM_DAYS = 366;

export const ADMIN_RANGE_KEYS: AdminRangeKey[] = [
  "today",
  "7d",
  "30d",
  "90d",
  "ytd",
  "custom",
];

export const ADMIN_RANGE_LABELS: Record<AdminRangeKey, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "This year",
  custom: "Custom range",
};

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function bucketFor(days: number): AdminBucket {
  if (days <= 1) return "hour";
  if (days <= 92) return "day";
  return "week";
}

function dayCount(fromMs: number, toMs: number): number {
  return Math.max(1, Math.ceil((toMs - fromMs) / DAY_MS));
}

/**
 * Resolves a range key against `now` (injectable so this is testable and so
 * a server render and its comparison use one clock).
 */
export function resolveAdminRange(
  key: AdminRangeKey,
  now: Date = new Date(),
  custom?: { from: string; to: string },
): ResolvedAdminRange {
  const today = startOfUtcDay(now);
  const nowIso = now.toISOString();

  if (key === "custom") {
    const parsed = parseCustomRange(custom, now);
    if (!parsed) return resolveAdminRange("30d", now);
    const { from, to } = parsed;
    const days = dayCount(from.getTime(), to.getTime());
    const prevFrom = new Date(from.getTime() - days * DAY_MS);
    return {
      key: "custom",
      from: from.toISOString(),
      to: to.toISOString(),
      prevFrom: prevFrom.toISOString(),
      prevTo: from.toISOString(),
      label: "Custom range",
      comparisonLabel: `vs previous ${days} day${days === 1 ? "" : "s"}`,
      bucket: bucketFor(days),
      days,
      isPartial: to.getTime() > today.getTime(),
    };
  }

  if (key === "today") {
    // A part-day must not be compared against a whole one, so yesterday is
    // cut at the same clock time (the rule the organizer dashboard uses).
    const elapsed = now.getTime() - today.getTime();
    const yesterday = new Date(today.getTime() - DAY_MS);
    return {
      key,
      from: today.toISOString(),
      to: nowIso,
      prevFrom: yesterday.toISOString(),
      prevTo: new Date(yesterday.getTime() + elapsed).toISOString(),
      label: "Today",
      comparisonLabel: "vs the same time yesterday",
      bucket: "hour",
      days: 1,
      isPartial: true,
    };
  }

  if (key === "ytd") {
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const elapsed = now.getTime() - yearStart.getTime();
    const lastYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
    const days = dayCount(yearStart.getTime(), now.getTime());
    return {
      key,
      from: yearStart.toISOString(),
      to: nowIso,
      prevFrom: lastYearStart.toISOString(),
      prevTo: new Date(lastYearStart.getTime() + elapsed).toISOString(),
      label: "This year",
      comparisonLabel: "vs the same period last year",
      bucket: bucketFor(days),
      days,
      isPartial: true,
    };
  }

  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  const from = new Date(today.getTime() - (days - 1) * DAY_MS);
  return {
    key,
    from: from.toISOString(),
    to: nowIso,
    prevFrom: new Date(from.getTime() - days * DAY_MS).toISOString(),
    prevTo: from.toISOString(),
    label: ADMIN_RANGE_LABELS[key],
    comparisonLabel: `vs previous ${days} days`,
    bucket: bucketFor(days),
    days,
    isPartial: true,
  };
}

function parseCustomRange(
  custom: { from: string; to: string } | undefined,
  now: Date,
): { from: Date; to: Date } | null {
  if (!custom?.from || !custom?.to) return null;
  const from = startOfUtcDay(new Date(`${custom.from.slice(0, 10)}T00:00:00Z`));
  const toDay = startOfUtcDay(new Date(`${custom.to.slice(0, 10)}T00:00:00Z`));
  if (Number.isNaN(from.getTime()) || Number.isNaN(toDay.getTime())) {
    return null;
  }
  if (toDay.getTime() < from.getTime()) return null;
  // The picker's end date is the last day the operator wants included, so
  // the exclusive end is the following midnight — capped at now, because a
  // window reaching into the future would report a fake zero.
  const exclusiveEnd = Math.min(toDay.getTime() + DAY_MS, now.getTime());
  if (exclusiveEnd <= from.getTime()) return null;
  if (exclusiveEnd - from.getTime() > MAX_CUSTOM_DAYS * DAY_MS) return null;
  return { from, to: new Date(exclusiveEnd) };
}

/**
 * Reads a range out of URL search params, falling back to 30 days for
 * anything missing or malformed — a bad link shows a sensible page, never an
 * error.
 */
export function parseAdminRangeParams(
  params: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): ResolvedAdminRange {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const key = first(params.range);
  if (key === "custom") {
    return resolveAdminRange("custom", now, {
      from: first(params.from) ?? "",
      to: first(params.to) ?? "",
    });
  }
  if (key && ADMIN_RANGE_KEYS.includes(key as AdminRangeKey)) {
    return resolveAdminRange(key as AdminRangeKey, now);
  }
  return resolveAdminRange("30d", now);
}

/** The `?range=…` query string that reproduces a resolved range. */
export function adminRangeQuery(range: ResolvedAdminRange): string {
  if (range.key !== "custom") return `range=${range.key}`;
  const day = (iso: string) => iso.slice(0, 10);
  // `to` is exclusive; the picker shows the last included day.
  const lastDay = new Date(new Date(range.to).getTime() - 1).toISOString();
  return `range=custom&from=${day(range.from)}&to=${day(lastDay)}`;
}
