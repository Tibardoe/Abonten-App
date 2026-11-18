import { describe, expect, it } from "vitest";
import { t } from "../i18n/testTranslator";
import {
  type EligibilitySnapshot,
  type EventEligibilitySnapshot,
  evaluateEligibility,
  evaluateEventEligibility,
} from "./eligibility";

const good: EligibilitySnapshot = {
  mode: "offline",
  ownerPhoneVerified: true,
  ownerIsTeamMember: false,
  placeStatus: "published",
  placeModerationState: "none",
  placeOwnerMatches: true,
  photoCount: 3,
  descriptionChars: 120,
  hasCategory: true,
  hasContact: true,
  hasOpeningHours: true,
  insideTerritory: true,
  submissionDistanceM: 40,
  submissionAccuracyM: 15,
  strongDuplicate: false,
  duplicateAcknowledged: false,
  reviewVerified: true,
  holdingElapsed: true,
};

const rule = {
  holding_days: 7,
  min_photos: 2,
  require_owner_phone_verified: true,
  require_inside_territory: true,
  max_distance_m: 200,
  min_description_chars: 80,
  require_opening_hours: true,
  require_contact: true,
  release_policy: "holding_period" as const,
};

const settings = { offlineMaxDistanceM: 200 };

describe("evaluateEligibility", () => {
  it("passes a complete offline onboarding", () => {
    const r = evaluateEligibility(t, good, rule, settings);
    expect(r.pass).toBe(true);
    expect(r.hard).toEqual([]);
    expect(r.soft).toEqual([]);
  });

  it("fails hard when the owner is unverified, a team member, or lost the listing", () => {
    const r = evaluateEligibility(
      t,
      {
        ...good,
        ownerPhoneVerified: false,
        ownerIsTeamMember: true,
        placeOwnerMatches: false,
        placeModerationState: "hidden",
      },
      rule,
      settings,
    );
    expect(r.pass).toBe(false);
    expect(r.hard).toEqual([
      "owner_verified",
      "owner_not_member",
      "place_not_moderated",
      "owner_matches",
    ]);
  });

  it("flags soft problems: photos, description, distance, duplicates", () => {
    const r = evaluateEligibility(
      t,
      {
        ...good,
        photoCount: 1,
        descriptionChars: 20,
        submissionDistanceM: 900,
        strongDuplicate: true,
        duplicateAcknowledged: true,
      },
      rule,
      settings,
    );
    expect(r.hard).toEqual([]);
    expect(r.soft).toEqual([
      "photos",
      "description",
      "on_site",
      "not_duplicate",
    ]);
    expect(r.pass).toBe(false);
  });

  it("allows GPS accuracy up to 100 m on top of the distance", () => {
    const within = evaluateEligibility(
      t,
      { ...good, submissionDistanceM: 280, submissionAccuracyM: 90 },
      rule,
      settings,
    );
    expect(within.soft).toEqual([]);
    const beyond = evaluateEligibility(
      t,
      { ...good, submissionDistanceM: 320, submissionAccuracyM: 500 },
      rule,
      settings,
    );
    expect(beyond.soft).toEqual(["on_site"]);
  });

  it("skips the on-site check for online work and unknown checks stay null", () => {
    const r = evaluateEligibility(
      t,
      {
        ...good,
        mode: "online",
        submissionDistanceM: null,
        placeStatus: null,
        placeModerationState: null,
        placeOwnerMatches: null,
        holdingElapsed: null,
      },
      rule,
      settings,
    );
    expect(r.checks.find((c) => c.key === "on_site")).toBeUndefined();
    expect(r.checks.find((c) => c.key === "place_published")?.ok).toBeNull();
    expect(r.checks.find((c) => c.key === "holding")?.ok).toBeNull();
    // A null check is neither a pass nor a failure.
    expect(r.hard).toEqual([]);
  });

  it("respects rule switches", () => {
    const r = evaluateEligibility(
      t,
      {
        ...good,
        hasContact: false,
        hasOpeningHours: false,
        insideTerritory: false,
      },
      {
        ...rule,
        require_contact: false,
        require_opening_hours: false,
        require_inside_territory: false,
      },
      settings,
    );
    expect(r.pass).toBe(true);
  });

  it("does not pass while a hard check is still pending", () => {
    // The lead has not decided yet: pending, not failed -- and definitely
    // not "ready", which would let money move on an unreviewed submission.
    const r = evaluateEligibility(
      t,
      { ...good, reviewVerified: null },
      rule,
      settings,
    );
    expect(r.checks.find((c) => c.key === "lead_verified")?.ok).toBeNull();
    expect(r.hard).toEqual([]);
    expect(r.pass).toBe(false);
  });

  it("still fails outright when the lead rejected it", () => {
    const r = evaluateEligibility(
      t,
      { ...good, reviewVerified: false },
      rule,
      settings,
    );
    expect(r.hard).toContain("lead_verified");
    expect(r.pass).toBe(false);
  });
});

const goodEvent: EventEligibilitySnapshot = {
  ownerPhoneVerified: true,
  ownerIsTeamMember: false,
  eventStatus: "published",
  eventModerationState: "none",
  eventOwnerMatches: true,
  hasFlyer: true,
  descriptionChars: 300,
  insideTerritory: true,
  reviewVerified: true,
  eventStarted: true,
};

describe("evaluateEventEligibility", () => {
  it("passes a published event that has started", () => {
    const r = evaluateEventEligibility(t, goodEvent, {
      ...rule,
      release_policy: "event_started",
    });
    expect(r.pass).toBe(true);
  });

  it("never asks an event for photos, opening hours or a contact", () => {
    const r = evaluateEventEligibility(t, goodEvent, rule);
    const keys = r.checks.map((c) => c.key);
    expect(keys).not.toContain("photos");
    expect(keys).not.toContain("opening_hours");
    expect(keys).not.toContain("contact");
    expect(keys).toContain("event_published");
    expect(keys).toContain("flyer");
  });

  it("is pending, not failed, before the event starts", () => {
    const r = evaluateEventEligibility(
      t,
      { ...goodEvent, eventStarted: false },
      rule,
    );
    const started = r.checks.find((c) => c.key === "event_started");
    expect(started?.ok).toBeNull();
    expect(started?.severity).toBe("info");
    expect(r.hard).toEqual([]);
  });

  it("fails a hidden event", () => {
    const r = evaluateEventEligibility(
      t,
      { ...goodEvent, eventModerationState: "hidden" },
      rule,
    );
    expect(r.hard).toContain("event_not_moderated");
    expect(r.pass).toBe(false);
  });
});

describe("moderation state", () => {
  it("counts a listing with no moderation state as visible, as the sweep does", () => {
    const place = evaluateEligibility(
      t,
      { ...good, placeModerationState: null },
      rule,
      settings,
    );
    expect(place.checks.find((c) => c.key === "place_not_moderated")?.ok).toBe(
      true,
    );
    const event = evaluateEventEligibility(
      t,
      { ...goodEvent, eventModerationState: null },
      rule,
    );
    expect(event.checks.find((c) => c.key === "event_not_moderated")?.ok).toBe(
      true,
    );
  });
});
