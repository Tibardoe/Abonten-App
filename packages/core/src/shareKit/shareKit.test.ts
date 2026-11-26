import { describe, expect, it } from "vitest";
import {
  eventShareAction,
  eventShareOffer,
  hasShareImages,
  isShareFormatFor,
  isShareSubjectKind,
  shareImageFileName,
  shareImagePath,
  shareSubjectPath,
} from "./shareKit";

describe("eventShareOffer", () => {
  it("offers tickets from the lowest paid price", () => {
    expect(
      eventShareOffer([
        { type: "VIP", price: 120, currency: "GHS" },
        { type: "General", price: "50", currency: "GHS" },
      ]),
    ).toEqual({
      kind: "tickets",
      fromAmount: 50,
      currency: "GHS",
      single: false,
    });
  });

  it("says when there is only one price", () => {
    expect(
      eventShareOffer([{ type: "SINGLE TICKET", price: 40, currency: "GHS" }]),
    ).toEqual({
      kind: "tickets",
      fromAmount: 40,
      currency: "GHS",
      single: true,
    });
  });

  it("is free only with the FREE tier", () => {
    expect(
      eventShareOffer([{ type: "FREE", price: 0, currency: "GHS" }]),
    ).toEqual({
      kind: "free",
    });
    // A 0-priced tier under another name is not free registration.
    expect(
      eventShareOffer([{ type: "Early", price: 0, currency: "GHS" }]),
    ).toEqual({
      kind: "none",
    });
  });

  it("has nothing to offer without tiers", () => {
    expect(eventShareOffer([])).toEqual({ kind: "none" });
  });

  it("ignores a paid tier without a currency", () => {
    expect(
      eventShareOffer([{ type: "VIP", price: 100, currency: null }]),
    ).toEqual({
      kind: "none",
    });
  });
});

describe("hasShareImages", () => {
  it("needs a published, visible listing", () => {
    expect(
      hasShareImages({
        published_at: "2026-11-01T00:00:00Z",
        status: "active",
        moderation_state: "visible",
      }),
    ).toBe(true);
    expect(hasShareImages({ published_at: null })).toBe(false);
    expect(
      hasShareImages({
        published_at: "2026-11-01T00:00:00Z",
        status: "canceled",
      }),
    ).toBe(false);
    expect(
      hasShareImages({
        published_at: "2026-11-01T00:00:00Z",
        moderation_state: "hidden",
      }),
    ).toBe(false);
    expect(
      hasShareImages({
        published_at: "2026-11-01T00:00:00Z",
        moderation_state: "removed",
      }),
    ).toBe(false);
  });
});

describe("share paths", () => {
  it("lower-cases event codes and carries the language", () => {
    expect(shareImagePath("events", "PPXYKW5C", "story", "fr")).toBe(
      "/api/share/events/ppxykw5c/story?hl=fr",
    );
    expect(shareSubjectPath("events", "PPXYKW5C")).toBe("/events/ppxykw5c");
  });

  it("keeps place slugs and usernames as they are", () => {
    expect(
      shareImagePath("places", "pilot-lounge-f51e0ea8", "welcome", "en"),
    ).toBe("/api/share/places/pilot-lounge-f51e0ea8/welcome?hl=en");
    expect(shareSubjectPath("profiles", "abontenevents")).toBe(
      "/user/abontenevents/posts",
    );
  });

  it("knows which images each kind has", () => {
    expect(isShareSubjectKind("events")).toBe(true);
    expect(isShareSubjectKind("users")).toBe(false);
    expect(isShareFormatFor("events", "story")).toBe(true);
    expect(isShareFormatFor("events", "welcome")).toBe(false);
    expect(isShareFormatFor("profiles", "welcome")).toBe(true);
    expect(isShareFormatFor("places", "post")).toBe(true);
  });

  it("names downloaded files safely", () => {
    expect(shareImageFileName("Pilot Lounge / Osu", "story")).toBe(
      "abonten-pilot-lounge-osu-story.png",
    );
    expect(shareImageFileName("***", "post")).toBe("abonten-listing-post.png");
  });
});

describe("eventShareAction", () => {
  it("asks people to reserve a spot only when the free event takes registrations", () => {
    expect(eventShareAction({ kind: "free" }, true)).toBe("free");
    expect(eventShareAction({ kind: "free" }, null)).toBe("free");
    expect(eventShareAction({ kind: "free" }, false)).toBe("none");
  });

  it("leaves tickets and nothing-on-sale alone", () => {
    const tickets = {
      kind: "tickets" as const,
      fromAmount: 50,
      currency: "GHS",
      single: true,
    };
    expect(eventShareAction(tickets, false)).toBe("tickets");
    expect(eventShareAction({ kind: "none" }, true)).toBe("none");
  });
});
