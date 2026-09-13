import { describe, expect, it } from "vitest";
import { applySmallSampleRule, ratioState } from "./smallSample";

describe("applySmallSampleRule", () => {
  it("leaves buckets alone once every one of them is large enough", () => {
    const r = applySmallSampleRule([
      { key: "google", count: 40 },
      { key: "phone", count: 12 },
    ]);
    expect(r.suppressedCount).toBe(0);
    expect(r.buckets.map((b) => b.count)).toEqual([40, 12]);
    expect(r.total).toBe(52);
  });

  it("hides a bucket small enough to identify someone", () => {
    const r = applySmallSampleRule([
      { key: "google", count: 40 },
      { key: "phone", count: 12 },
      { key: "email", count: 2 },
      { key: "apple", count: 1 },
    ]);
    const hidden = r.buckets.filter((b) => b.suppressed).map((b) => b.key);
    expect(hidden).toEqual(["email", "apple"]);
    // A suppressed bucket is null, never 0 — 0 would read as "nobody".
    expect(r.buckets.find((b) => b.key === "email")?.count).toBeNull();
  });

  it("hides a second bucket so the first cannot be recovered by subtraction", () => {
    // Total 53 with google 40 and phone 12 shown would give email = 1.
    const r = applySmallSampleRule([
      { key: "google", count: 40 },
      { key: "phone", count: 12 },
      { key: "email", count: 1 },
    ]);
    expect(r.suppressedCount).toBe(2);
    expect(r.buckets.find((b) => b.key === "phone")?.suppressed).toBe(true);
  });

  it("reports when nothing at all can be shown", () => {
    const r = applySmallSampleRule([
      { key: "google", count: 3 },
      { key: "phone", count: 2 },
    ]);
    expect(r.allSuppressed).toBe(true);
    expect(r.total).toBe(5);
  });

  it("ignores empty buckets rather than suppressing them", () => {
    const r = applySmallSampleRule([
      { key: "google", count: 40 },
      { key: "phone", count: 8 },
      { key: "apple", count: 0 },
    ]);
    expect(r.buckets.find((b) => b.key === "apple")?.suppressed).toBe(false);
  });
});

describe("ratioState", () => {
  it("refuses a percentage the sample cannot support", () => {
    expect(ratioState(1, 3)).toBe("insufficient");
    expect(ratioState(0, 0)).toBe("no-data");
    expect(ratioState(3, 40)).toBe("ok");
  });
});
