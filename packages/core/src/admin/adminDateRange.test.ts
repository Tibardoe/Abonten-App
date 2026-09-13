import { describe, expect, it } from "vitest";
import {
  adminRangeQuery,
  parseAdminRangeParams,
  resolveAdminRange,
} from "./adminDateRange";

// Fixed clock: Sunday 13 September 2026, 14:30 UTC (= Africa/Accra).
const NOW = new Date("2026-09-13T14:30:00.000Z");

describe("resolveAdminRange", () => {
  it("starts each range at a midnight boundary and ends at now", () => {
    const r = resolveAdminRange("7d", NOW);
    // 7 days including today: 7 Sep 00:00 through now.
    expect(r.from).toBe("2026-09-07T00:00:00.000Z");
    expect(r.to).toBe(NOW.toISOString());
    expect(r.days).toBe(7);
    expect(r.bucket).toBe("day");
    expect(r.isPartial).toBe(true);
    expect(r.label).toBe("Last 7 days");
  });

  it("compares against the equal window immediately before, with no overlap", () => {
    const r = resolveAdminRange("30d", NOW);
    expect(r.from).toBe("2026-08-15T00:00:00.000Z");
    expect(r.prevFrom).toBe("2026-07-16T00:00:00.000Z");
    // Half-open: the previous window ends exactly where this one starts, so
    // a row belongs to one window or the other, never both.
    expect(r.prevTo).toBe(r.from);
    expect(r.comparisonLabel).toBe("vs previous 30 days");
  });

  it("compares a part-day against the same elapsed time yesterday", () => {
    const r = resolveAdminRange("today", NOW);
    expect(r.from).toBe("2026-09-13T00:00:00.000Z");
    expect(r.prevFrom).toBe("2026-09-12T00:00:00.000Z");
    // 14h30 into today, so 14h30 into yesterday — not the whole of yesterday.
    expect(r.prevTo).toBe("2026-09-12T14:30:00.000Z");
    expect(r.bucket).toBe("hour");
    expect(r.comparisonLabel).toBe("vs the same time yesterday");
  });

  it("buckets by week once a range is longer than a quarter", () => {
    expect(resolveAdminRange("90d", NOW).bucket).toBe("day");
    expect(resolveAdminRange("ytd", NOW).bucket).toBe("week");
  });

  it("runs this year from 1 January and compares with last year", () => {
    const r = resolveAdminRange("ytd", NOW);
    expect(r.from).toBe("2026-01-01T00:00:00.000Z");
    expect(r.prevFrom).toBe("2025-01-01T00:00:00.000Z");
    expect(r.comparisonLabel).toBe("vs the same period last year");
  });

  it("treats a custom end date as the last day included", () => {
    const r = resolveAdminRange("custom", NOW, {
      from: "2026-09-01",
      to: "2026-09-07",
    });
    expect(r.from).toBe("2026-09-01T00:00:00.000Z");
    // Exclusive end is the following midnight, so the 7th is included whole.
    expect(r.to).toBe("2026-09-08T00:00:00.000Z");
    expect(r.days).toBe(7);
    expect(r.isPartial).toBe(false);
    expect(r.prevFrom).toBe("2026-08-25T00:00:00.000Z");
  });

  it("never reports on the future", () => {
    const r = resolveAdminRange("custom", NOW, {
      from: "2026-09-13",
      to: "2026-12-31",
    });
    // A window running past now would show a fake zero for days that have
    // not happened; it is capped at now instead.
    expect(r.to).toBe(NOW.toISOString());
  });

  it("falls back to 30 days when a custom range makes no sense", () => {
    const bad = [
      { from: "2026-09-10", to: "2026-09-01" }, // backwards
      { from: "not-a-date", to: "2026-09-01" },
      { from: "2020-01-01", to: "2026-09-13" }, // longer than a year
    ];
    for (const custom of bad) {
      const r = resolveAdminRange("custom", NOW, custom);
      expect(r.key).toBe("30d");
    }
  });
});

describe("parseAdminRangeParams", () => {
  it("defaults to 30 days for a missing or unknown range", () => {
    expect(parseAdminRangeParams({}, NOW).key).toBe("30d");
    expect(parseAdminRangeParams({ range: "forever" }, NOW).key).toBe("30d");
  });

  it("reads a preset and a custom range out of the query", () => {
    expect(parseAdminRangeParams({ range: "7d" }, NOW).key).toBe("7d");
    const custom = parseAdminRangeParams(
      { range: "custom", from: "2026-09-01", to: "2026-09-07" },
      NOW,
    );
    expect(custom.key).toBe("custom");
    expect(custom.from).toBe("2026-09-01T00:00:00.000Z");
  });

  it("round-trips through the query string it builds", () => {
    const original = resolveAdminRange("custom", NOW, {
      from: "2026-09-01",
      to: "2026-09-07",
    });
    const query = Object.fromEntries(
      new URLSearchParams(adminRangeQuery(original)),
    );
    const back = parseAdminRangeParams(query, NOW);
    expect(back.from).toBe(original.from);
    expect(back.to).toBe(original.to);
  });
});
