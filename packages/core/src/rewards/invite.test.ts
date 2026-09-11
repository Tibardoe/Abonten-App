import { describe, expect, it } from "vitest";
import {
  bindResultMessage,
  codeFromInstallReferrer,
  inviteCodeFromPath,
  inviteShareMessage,
  inviteUrl,
  isFinalBindResult,
  pickInvite,
  playStoreUrl,
  withoutInvites,
} from "./invite";

const NOW = Date.parse("2026-09-11T12:00:00Z");
const DAY = 86_400_000;

describe("invite links", () => {
  it("builds and reads /invite/CODE", () => {
    expect(inviteUrl("K7QX2MA")).toBe("https://abontenhub.com/invite/K7QX2MA");
    expect(inviteUrl("K7QX2MA", "http://localhost:3000/")).toBe(
      "http://localhost:3000/invite/K7QX2MA",
    );
    expect(inviteCodeFromPath("/invite/k7qx2ma")).toBe("K7QX2MA");
    expect(inviteCodeFromPath("/invite/nope")).toBeNull();
    expect(inviteCodeFromPath("/events/K7QX2MA")).toBeNull();
    expect(inviteCodeFromPath("/invite/%E0%A4%A")).toBeNull();
  });

  it("passes the code through the Play Store and reads it back", () => {
    const url = playStoreUrl("K7QX2MA");
    expect(url).toContain("id=com.abonten.app");
    expect(url).toContain("&referrer=ref%3DK7QX2MA");
    expect(playStoreUrl()).not.toContain("referrer");

    expect(codeFromInstallReferrer("ref=K7QX2MA")).toBe("K7QX2MA");
    expect(codeFromInstallReferrer("ref%3DK7QX2MA%26utm_source%3Dx")).toBe(
      "K7QX2MA",
    );
    expect(
      codeFromInstallReferrer("utm_source=google-play&utm_medium=organic"),
    ).toBeNull();
    expect(codeFromInstallReferrer(null)).toBeNull();
  });
});

describe("the invite a browser holds", () => {
  it("prefers an invite link or typed code over a generic ?ref link, within 30 days", () => {
    const map = {
      u: { c: "AAAAAAA", t: NOW - DAY },
      i: { c: "BBBBBBB", t: NOW - 2 * DAY, s: "typed" as const },
      "e:party": { c: "CCCCCCC", t: NOW },
    };
    expect(pickInvite(map, NOW)).toEqual({
      code: "BBBBBBB",
      touchedAt: new Date(NOW - 2 * DAY).toISOString(),
      source: "typed",
    });
    expect(pickInvite({ u: map.u }, NOW)?.source).toBe("link");
    expect(pickInvite({ i: { c: "BBBBBBB", t: NOW - 31 * DAY } }, NOW)).toBe(
      null,
    );
    expect(pickInvite({ "e:party": map["e:party"] }, NOW)).toBeNull();
    expect(withoutInvites(map)).toEqual({ "e:party": map["e:party"] });
  });

  it("forgets an invite only on a final answer", () => {
    expect(isFinalBindResult("bound")).toBe(true);
    expect(isFinalBindResult("not_new")).toBe(true);
    expect(isFinalBindResult("rate_limited")).toBe(false);
    expect(isFinalBindResult("capture_off")).toBe(false);
    expect(isFinalBindResult("error")).toBe(false);
  });
});

describe("invite copy", () => {
  it("words the share message with the friend's offer", () => {
    expect(
      inviteShareMessage({
        url: "https://abontenhub.com/invite/K7QX2MA",
        refereeMinor: 200,
        minOrderMinor: 3000,
      }),
    ).toBe(
      "Join me on Abonten to find events and places near you and get GH₵ 2.00 off your first ticket of GH₵ 30.00 or more: https://abontenhub.com/invite/K7QX2MA",
    );
    expect(
      inviteShareMessage({ url: "u", refereeMinor: null, minOrderMinor: null }),
    ).toBe("Join me on Abonten to find events and places near you: u");
  });

  it("explains every bind answer", () => {
    const base = {
      referrerName: "Ama K.",
      welcome: "none" as const,
      welcomeMinor: 200,
    };
    expect(
      bindResultMessage({ ...base, result: "bound", welcome: "granted" }),
    ).toEqual({
      tone: "success",
      text: "You joined with Ama K.'s invite. GH₵ 2.00 welcome credit is ready for your first ticket.",
    });
    expect(
      bindResultMessage({ ...base, result: "bound", welcome: "needs_phone" })
        .text,
    ).toContain("Verify your phone number");
    expect(bindResultMessage({ ...base, result: "not_new" }).tone).toBe(
      "error",
    );
    expect(bindResultMessage({ ...base, result: "program_off" }).tone).toBe(
      "info",
    );
  });
});
