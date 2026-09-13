import { describe, expect, it } from "vitest";
import { describeSeries } from "./describeSeries";

const points = [
  { bucketStart: "2026-09-11", value: 2 },
  { bucketStart: "2026-09-12", value: 7 },
  { bucketStart: "2026-09-13", value: 3 },
];

describe("describeSeries", () => {
  it("summarises a chart for someone who cannot see it", () => {
    const text = describeSeries(points, {
      label: "New users",
      rangeLabel: "Last 7 days",
      previousTotal: 9,
    });
    expect(text).toContain("New users, last 7 days");
    expect(text).toContain("12 in total");
    expect(text).toContain("highest 7 on 2026-09-12");
    expect(text).toContain("previous period 9");
  });

  it("distinguishes an empty chart from a flat one", () => {
    expect(describeSeries([], { label: "New users" })).toContain("no data");
    const flat = describeSeries(
      points.map((p) => ({ ...p, value: 0 })),
      { label: "New users" },
    );
    expect(flat).toContain("nothing recorded");
    expect(flat).toContain("3 days");
  });

  it("uses the caller's money formatting", () => {
    const text = describeSeries(points, {
      label: "Gross ticket sales",
      format: (v) => `GH₵${v.toFixed(2)}`,
    });
    expect(text).toContain("GH₵12.00");
  });

  it("says nothing about a comparison that does not exist", () => {
    const text = describeSeries(points, { label: "New users" });
    expect(text).not.toContain("previous period");
  });
});
