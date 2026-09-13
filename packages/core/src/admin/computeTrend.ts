// "Is this number going up or down?" — the one rule the whole console uses.
//
// Lifted from OrganizerOverviewCards so the admin console and the organizer
// dashboard can never drift apart on what a percentage means, and so the
// two cases where a percentage would be a lie stay explicit:
//   * no previous window at all (all-time figures) -> no trend
//   * previous was 0 and current is 0 -> nothing happened either side
//   * previous was 0 and current is not -> "New", not +Infinity%

export type TrendResult =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "percent"; value: number };

export type TrendDirection = "up" | "down" | "flat" | "new" | "none";

export function computeTrend(
  current: number,
  previous: number | null | undefined,
): TrendResult {
  if (previous === null || previous === undefined) return { kind: "none" };
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { kind: "none" };
  }
  if (previous === 0 && current === 0) return { kind: "none" };
  if (previous === 0) return { kind: "new" };
  return { kind: "percent", value: ((current - previous) / previous) * 100 };
}

/** Anything under 0.05% reads as flat: a rounding wobble is not a trend. */
export function trendDirection(trend: TrendResult): TrendDirection {
  if (trend.kind === "none") return "none";
  if (trend.kind === "new") return "new";
  if (Math.abs(trend.value) < 0.05) return "flat";
  return trend.value > 0 ? "up" : "down";
}

/** `+12.5%`, `−8.0%`, `0%` — always signed, U+2212 for the minus. */
export function formatTrendPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.05) return "0%";
  const sign = value > 0 ? "+" : "\u2212";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}
