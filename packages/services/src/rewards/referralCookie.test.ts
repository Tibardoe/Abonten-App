import { describe, expect, it } from "vitest";
import { deriveSigningKey } from "../security/signing";
import {
  addTouchToCookie,
  decodeReferralCookie,
  encodeReferralCookie,
  referralKeyForPath,
} from "./referralCookie";

const key = deriveSigningKey("referral-cookie:v1", "test-secret");
const now = Date.parse("2026-09-11T12:00:00Z");

describe("referral cookie", () => {
  it("keys touches by what the link pointed at", () => {
    expect(referralKeyForPath("/events/afro-fest-2026")).toBe(
      "e:afro-fest-2026",
    );
    expect(referralKeyForPath("/places/osu-castle")).toBe("p:osu-castle");
    expect(referralKeyForPath("/")).toBe("u");
    expect(referralKeyForPath("/explore")).toBe("u");
  });

  it("round-trips touches and keeps the latest per target", () => {
    const first = addTouchToCookie(
      null,
      "/events/x",
      "aaaaaaa",
      now - 1000,
      key,
    );
    const second = addTouchToCookie(first, "/events/x", "BBBBBBB", now, key);
    const third = addTouchToCookie(second, "/places/y", "CCCCCCC", now, key);
    expect(decodeReferralCookie(third, key)).toEqual({
      "e:x": { c: "BBBBBBB", t: now },
      "p:y": { c: "CCCCCCC", t: now },
    });
  });

  it("ignores an invalid code", () => {
    expect(addTouchToCookie(null, "/events/x", "nope", now, key)).toBeNull();
  });

  it("rejects a tampered or foreign cookie", () => {
    const value = encodeReferralCookie(
      { "e:x": { c: "AAAAAAA", t: now } },
      key,
    );
    const [payload, signature] = value.split(".");
    const forged = Buffer.from(
      JSON.stringify({ "e:x": { c: "AAAAAAA", t: now + 86_400_000 * 20 } }),
    ).toString("base64url");
    expect(decodeReferralCookie(`${forged}.${signature}`, key)).toEqual({});
    expect(decodeReferralCookie(`${payload}.x${signature}`, key)).toEqual({});
    expect(
      decodeReferralCookie(
        value,
        deriveSigningKey("referral-cookie:v1", "another-secret"),
      ),
    ).toEqual({});
    expect(decodeReferralCookie("garbage", key)).toEqual({});
    expect(decodeReferralCookie(undefined, key)).toEqual({});
  });

  it("drops entries that aren't well-formed touches", () => {
    const value = encodeReferralCookie(
      {
        good: { c: "AAAAAAA", t: now },
        bad: { c: "not a code", t: now },
      } as never,
      key,
    );
    expect(decodeReferralCookie(value, key)).toEqual({
      good: { c: "AAAAAAA", t: now },
    });
  });
});
