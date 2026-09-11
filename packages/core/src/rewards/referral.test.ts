import { describe, expect, it } from "vitest";
import {
  pickReferralTouch,
  rememberTouch,
  storedToTouch,
} from "./referralAttribution";
import { normalizeReferralCode, withReferralCode } from "./referralCode";
import { riskFlagLabel, scoreRisk } from "./riskScore";

const DAY = 86_400_000;
const now = Date.parse("2026-09-11T12:00:00Z");
const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

describe("normalizeReferralCode", () => {
  it("accepts codes as people type them", () => {
    expect(normalizeReferralCode("k7qx2ma")).toBe("K7QX2MA");
    expect(normalizeReferralCode(" K7QX-2MA ")).toBe("K7QX2MA");
    expect(normalizeReferralCode("k7q x2ma")).toBe("K7QX2MA");
  });

  it("rejects look-alike characters, wrong lengths and junk", () => {
    expect(normalizeReferralCode("K7QX2M0")).toBeNull(); // zero
    expect(normalizeReferralCode("K7QX2MO")).toBeNull(); // letter O
    expect(normalizeReferralCode("K7QX2M1")).toBeNull();
    expect(normalizeReferralCode("K7QX2MI")).toBeNull();
    expect(normalizeReferralCode("K7QX2ML")).toBeNull();
    expect(normalizeReferralCode("K7QX2M")).toBeNull();
    expect(normalizeReferralCode("K7QX2MAA")).toBeNull();
    expect(normalizeReferralCode("<script>")).toBeNull();
    expect(normalizeReferralCode(null)).toBeNull();
  });
});

describe("withReferralCode", () => {
  it("adds or replaces the ref parameter", () => {
    expect(withReferralCode("https://abontenhub.com/events/x", "K7QX2MA")).toBe(
      "https://abontenhub.com/events/x?ref=K7QX2MA",
    );
    expect(
      withReferralCode(
        "https://abontenhub.com/events/x?ref=AAAAAAA&a=1",
        "K7QX2MA",
      ),
    ).toBe("https://abontenhub.com/events/x?ref=K7QX2MA&a=1");
  });

  it("leaves the URL alone without a code", () => {
    expect(withReferralCode("https://abontenhub.com/events/x", null)).toBe(
      "https://abontenhub.com/events/x",
    );
  });
});

describe("pickReferralTouch", () => {
  const options = { now, windowDays: 7 };

  it("picks the most recent touch in the window (last touch wins)", () => {
    const picked = pickReferralTouch(
      [
        { code: "AAAAAAA", touchedAt: at(3), source: "link" },
        { code: "BBBBBBB", touchedAt: at(1), source: "link" },
        { code: "CCCCCCC", touchedAt: at(2), source: "qr" },
      ],
      options,
    );
    expect(picked?.code).toBe("BBBBBBB");
  });

  it("ignores expired, future and excluded touches", () => {
    expect(
      pickReferralTouch(
        [{ code: "AAAAAAA", touchedAt: at(8), source: "link" }],
        options,
      ),
    ).toBeNull();
    expect(
      pickReferralTouch(
        [{ code: "AAAAAAA", touchedAt: at(-1), source: "link" }],
        options,
      ),
    ).toBeNull();
    expect(
      pickReferralTouch(
        [
          { code: "AAAAAAA", touchedAt: at(1), source: "link" },
          { code: "BBBBBBB", touchedAt: at(2), source: "link" },
        ],
        { ...options, excludeCodes: ["AAAAAAA"] },
      )?.code,
    ).toBe("BBBBBBB");
    expect(pickReferralTouch([null, undefined], options)).toBeNull();
  });

  it("tolerates a little clock skew", () => {
    const skewed = new Date(now + 60_000).toISOString();
    expect(
      pickReferralTouch(
        [{ code: "AAAAAAA", touchedAt: skewed, source: "link" }],
        options,
      )?.code,
    ).toBe("AAAAAAA");
  });
});

describe("rememberTouch", () => {
  it("keeps the newest entries and drops expired ones", () => {
    let map = {};
    for (let i = 0; i < 12; i++) {
      map = rememberTouch(
        map,
        `e:${i}`,
        { c: "AAAAAAA", t: now - (12 - i) * 1000 },
        { now },
      );
    }
    expect(Object.keys(map)).toHaveLength(10);
    expect(map).toHaveProperty("e:11");
    expect(map).not.toHaveProperty("e:0");

    const withOld = rememberTouch(
      { old: { c: "AAAAAAA", t: now - 40 * DAY } },
      "new",
      { c: "BBBBBBB", t: now },
      { now },
    );
    expect(Object.keys(withOld)).toEqual(["new"]);
  });

  it("replaces the touch for the same key", () => {
    const map = rememberTouch(
      { "e:1": { c: "AAAAAAA", t: now - 1000 } },
      "e:1",
      { c: "BBBBBBB", t: now },
      { now },
    );
    expect(storedToTouch(map["e:1"])).toEqual({
      code: "BBBBBBB",
      touchedAt: new Date(now).toISOString(),
      source: "link",
    });
  });
});

describe("scoreRisk", () => {
  it("passes a clean sale automatically", () => {
    expect(scoreRisk([])).toEqual({
      score: 0,
      decision: "auto",
      blockedBy: null,
    });
    expect(scoreRisk(["new_buyer_account"]).decision).toBe("auto");
  });

  it("holds for review from 30 and rejects from 70", () => {
    expect(scoreRisk(["velocity"])).toMatchObject({
      score: 30,
      decision: "review",
    });
    expect(scoreRisk(["shared_device", "new_buyer_account"])).toMatchObject({
      score: 75,
      decision: "reject",
    });
  });

  it("a check-in lowers the score but never below zero", () => {
    expect(scoreRisk(["velocity", "checked_in"])).toMatchObject({
      score: 15,
      decision: "auto",
    });
    expect(scoreRisk(["checked_in"]).score).toBe(0);
  });

  it("blocking flags reject regardless of score", () => {
    expect(scoreRisk(["same_payment_method"])).toMatchObject({
      decision: "reject",
      blockedBy: "same_payment_method",
    });
  });

  it("honours weight overrides", () => {
    expect(scoreRisk(["velocity"], { velocity: 10 }).decision).toBe("auto");
    expect(scoreRisk(["velocity"], { review_threshold: 50 }).decision).toBe(
      "auto",
    );
  });

  it("labels flags for admins", () => {
    expect(riskFlagLabel("shared_device")).toBe("Same device as the referrer");
    expect(riskFlagLabel("something_new")).toBe("something new");
  });
});
