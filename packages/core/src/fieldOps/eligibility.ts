// The objective checks behind "a successful onboarding" (plan §8.2). The
// SQL sweep (Phase 3) is the authority that moves money; this TypeScript
// copy drives the lead's and admin's review checklist and the unit tests,
// so the two always describe the same rules.

import type { CoreTranslator, TranslationValues } from "../i18n/translator";

export type EligibilityRule = {
  holding_days?: number;
  min_photos?: number;
  require_owner_phone_verified?: boolean;
  require_inside_territory?: boolean;
  max_distance_m?: number;
  min_description_chars?: number;
  require_opening_hours?: boolean;
  require_contact?: boolean;
  release_policy?: "holding_period" | "event_started" | "claim_approved";
};

export type EligibilitySnapshot = {
  mode: "offline" | "online";
  ownerPhoneVerified: boolean;
  /** The owner's phone is a team member's phone (any campaign). */
  ownerIsTeamMember: boolean;
  /** place.status / moderation_state / owner match; null = no place yet. */
  placeStatus: string | null;
  placeModerationState: string | null;
  placeOwnerMatches: boolean | null;
  /** Cover + gallery. */
  photoCount: number;
  descriptionChars: number;
  hasCategory: boolean;
  hasContact: boolean;
  hasOpeningHours: boolean;
  insideTerritory: boolean | null;
  submissionDistanceM: number | null;
  submissionAccuracyM: number | null;
  /** A strong duplicate match the member acknowledged anyway. */
  strongDuplicate: boolean;
  duplicateAcknowledged: boolean;
  /** null = the lead has not decided yet (pending, not a failure). */
  reviewVerified: boolean | null;
  /** null = holding period not started (not verified yet). */
  holdingElapsed: boolean | null;
};

export type EligibilityCheck = {
  key: string;
  label: string;
  ok: boolean | null;
  severity: "hard" | "soft" | "info";
  detail: string | null;
};

export type EligibilityResult = {
  checks: EligibilityCheck[];
  /**
   * Every hard check passed, none is still pending, and no soft check
   * failed. A pending hard check (ok === null -- no listing yet, no review
   * yet) is not a pass: it is simply not answerable, so it must never read
   * as "ready".
   */
  pass: boolean;
  hard: string[];
  soft: string[];
};

const HIDDEN = new Set(["hidden", "removed"]);

export function evaluateEligibility(
  t: CoreTranslator,
  s: EligibilitySnapshot,
  rule: EligibilityRule,
  settings: { offlineMaxDistanceM: number },
): EligibilityResult {
  const checks: EligibilityCheck[] = [];
  const e = (key: string, values?: TranslationValues) =>
    t(`fieldOpsEligibility.${key}`, values);
  const add = (
    key: string,
    label: string,
    ok: boolean | null,
    severity: EligibilityCheck["severity"],
    detail: string | null = null,
  ) => checks.push({ key, label, ok, severity, detail });

  if (rule.require_owner_phone_verified !== false) {
    add("owner_verified", e("ownerVerified"), s.ownerPhoneVerified, "hard");
  }
  add("owner_not_member", e("ownerNotMember"), !s.ownerIsTeamMember, "hard");

  add(
    "place_published",
    e("placePublished"),
    s.placeStatus === null ? null : s.placeStatus === "published",
    "hard",
    s.placeStatus
      ? e("placeStatus", { status: s.placeStatus })
      : e("noListingYet"),
  );
  add(
    "place_not_moderated",
    e("placeNotModerated"),
    s.placeModerationState === null
      ? null
      : !HIDDEN.has(s.placeModerationState),
    "hard",
    s.placeModerationState
      ? e("moderation", { state: s.placeModerationState })
      : null,
  );
  add("owner_matches", e("ownerMatches"), s.placeOwnerMatches, "hard");

  const minPhotos = rule.min_photos ?? 2;
  add(
    "photos",
    e("photos", { count: minPhotos }),
    s.photoCount >= minPhotos,
    "soft",
    e("photosUploaded", { count: s.photoCount }),
  );
  const minChars = rule.min_description_chars ?? 80;
  add(
    "description",
    e("description", { count: minChars }),
    s.descriptionChars >= minChars,
    "soft",
    e("descriptionChars", { count: s.descriptionChars }),
  );
  add("category", e("category"), s.hasCategory, "soft");
  if (rule.require_contact !== false) {
    add("contact", e("contact"), s.hasContact, "soft");
  }
  if (rule.require_opening_hours !== false) {
    add("opening_hours", e("openingHours"), s.hasOpeningHours, "soft");
  }

  if (rule.require_inside_territory !== false) {
    add("inside_territory", e("insideTerritory"), s.insideTerritory, "soft");
  }
  if (s.mode === "offline") {
    const max = rule.max_distance_m ?? settings.offlineMaxDistanceM;
    const allowance = Math.min(s.submissionAccuracyM ?? 0, 100);
    const ok =
      s.submissionDistanceM === null
        ? false
        : s.submissionDistanceM <= max + allowance;
    add(
      "on_site",
      e("onSite", { max }),
      ok,
      "soft",
      s.submissionDistanceM === null
        ? e("noPosition")
        : s.submissionAccuracyM !== null
          ? e("distanceAwayAccuracy", {
              distance: s.submissionDistanceM,
              accuracy: s.submissionAccuracyM,
            })
          : e("distanceAway", { distance: s.submissionDistanceM }),
    );
  }

  add(
    "not_duplicate",
    e("notDuplicate"),
    !s.strongDuplicate,
    "soft",
    s.strongDuplicate
      ? s.duplicateAcknowledged
        ? e("duplicateDifferent")
        : e("duplicateUnacknowledged")
      : null,
  );

  add("lead_verified", e("leadVerified"), s.reviewVerified, "hard");
  if ((rule.release_policy ?? "holding_period") === "holding_period") {
    add(
      "holding",
      e("holding", { days: rule.holding_days ?? 7 }),
      s.holdingElapsed,
      "info",
    );
  }

  const hard = checks
    .filter((c) => c.severity === "hard" && c.ok === false)
    .map((c) => c.key);
  const soft = checks
    .filter((c) => c.severity === "soft" && c.ok === false)
    .map((c) => c.key);
  const pendingHard = checks.some(
    (c) => c.severity === "hard" && c.ok === null,
  );
  return {
    checks,
    pass: hard.length === 0 && soft.length === 0 && !pendingHard,
    hard,
    soft,
  };
}
