import { describe, expect, it } from "vitest";
import { type EligibilitySnapshot, evaluateEligibility } from "./eligibility";

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
    const r = evaluateEligibility(good, rule, settings);
    expect(r.pass).toBe(true);
    expect(r.hard).toEqual([]);
    expect(r.soft).toEqual([]);
  });

  it("fails hard when the owner is unverified, a team member, or lost the listing", () => {
    const r = evaluateEligibility(
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
      { ...good, submissionDistanceM: 280, submissionAccuracyM: 90 },
      rule,
      settings,
    );
    expect(within.soft).toEqual([]);
    const beyond = evaluateEligibility(
      { ...good, submissionDistanceM: 320, submissionAccuracyM: 500 },
      rule,
      settings,
    );
    expect(beyond.soft).toEqual(["on_site"]);
  });

  it("skips the on-site check for online work and unknown checks stay null", () => {
    const r = evaluateEligibility(
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
});
