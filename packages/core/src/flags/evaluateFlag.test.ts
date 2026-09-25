import { describe, expect, it } from "vitest";
import {
  compareVersions,
  evaluateFlag,
  evaluateFlags,
  rolloutBucket,
} from "./evaluateFlag";

describe("evaluateFlag", () => {
  it("fails safe", () => {
    expect(evaluateFlag(null)).toBe(false);
    expect(evaluateFlag({ key: "x", enabled: false, rules: null })).toBe(false);
    expect(evaluateFlag({ key: "x", enabled: true, rules: null })).toBe(true);
    expect(
      evaluateFlag(
        { key: "x", enabled: true, rules: { percent: 0 } },
        { subjectId: "u" },
      ),
    ).toBe(false);
    // A percentage rollout with no subject is off: nothing to be stable on.
    expect(
      evaluateFlag({ key: "x", enabled: true, rules: { percent: 50 } }, {}),
    ).toBe(false);
  });

  it("targets countries and platforms", () => {
    const flag = {
      key: "checkout.v2",
      enabled: true,
      rules: {
        countries: ["NG", "ke"],
        platforms: ["ios", "android"] as const,
      },
    };
    expect(
      evaluateFlag(flag as never, { countryCode: "ng", platform: "ios" }),
    ).toBe(true);
    expect(
      evaluateFlag(flag as never, { countryCode: "KE", platform: "android" }),
    ).toBe(true);
    expect(
      evaluateFlag(flag as never, { countryCode: "GH", platform: "ios" }),
    ).toBe(false);
    expect(
      evaluateFlag(flag as never, { countryCode: "NG", platform: "web" }),
    ).toBe(false);
    expect(evaluateFlag(flag as never, { platform: "ios" })).toBe(false);
  });

  it("targets cohorts, versions and explicit subjects", () => {
    expect(
      evaluateFlag(
        { key: "f", enabled: true, rules: { cohorts: ["staff"] } },
        { cohorts: ["beta"] },
      ),
    ).toBe(false);
    expect(
      evaluateFlag(
        { key: "f", enabled: true, rules: { cohorts: ["staff", "beta"] } },
        { cohorts: ["beta"] },
      ),
    ).toBe(true);
    expect(
      evaluateFlag(
        { key: "f", enabled: true, rules: { minAppVersion: "1.4.0" } },
        { appVersion: "1.3.9" },
      ),
    ).toBe(false);
    expect(
      evaluateFlag(
        { key: "f", enabled: true, rules: { minAppVersion: "1.4.0" } },
        { appVersion: "1.4.0" },
      ),
    ).toBe(true);
    expect(
      evaluateFlag(
        { key: "f", enabled: true, rules: { minAppVersion: "1.4.0" } },
        {},
      ),
    ).toBe(false);
    expect(
      evaluateFlag(
        {
          key: "f",
          enabled: true,
          rules: { countries: ["NG"], allowSubjects: ["u1"] },
        },
        { countryCode: "GH", subjectId: "u1" },
      ),
    ).toBe(true);
  });

  it("rolls out by a stable percentage", () => {
    const flag = { key: "rollout", enabled: true, rules: { percent: 25 } };
    let on = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) {
      if (evaluateFlag(flag, { subjectId: `user-${i}` })) on += 1;
    }
    expect(on / n).toBeGreaterThan(0.22);
    expect(on / n).toBeLessThan(0.28);
    // Stable: the same subject gets the same answer every time…
    expect(evaluateFlag(flag, { subjectId: "user-42" })).toBe(
      evaluateFlag(flag, { subjectId: "user-42" }),
    );
    // …and only ever gains people as the percentage grows.
    for (let i = 0; i < 2000; i++) {
      const id = `user-${i}`;
      if (evaluateFlag(flag, { subjectId: id })) {
        expect(
          evaluateFlag({ ...flag, rules: { percent: 60 } }, { subjectId: id }),
        ).toBe(true);
      }
    }
    expect(rolloutBucket("k", "s")).toBeGreaterThanOrEqual(0);
    expect(rolloutBucket("k", "s")).toBeLessThan(100);
  });

  it("evaluates a table", () => {
    const out = evaluateFlags(
      [
        { key: "a", enabled: true, rules: null },
        { key: "b", enabled: true, rules: { countries: ["NG"] } },
      ],
      { countryCode: "GH" },
    );
    expect(out).toEqual({ a: true, b: false });
    expect(compareVersions("2.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.9.9", "1.10")).toBe(-1);
  });
});
