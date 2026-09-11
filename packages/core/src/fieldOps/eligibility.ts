// The objective checks behind "a successful onboarding" (plan §8.2). The
// SQL sweep (Phase 3) is the authority that moves money; this TypeScript
// copy drives the lead's and admin's review checklist and the unit tests,
// so the two always describe the same rules.

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
  reviewVerified: boolean;
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
  /** Every hard check passed and no soft check failed. */
  pass: boolean;
  hard: string[];
  soft: string[];
};

const HIDDEN = new Set(["hidden", "removed"]);

export function evaluateEligibility(
  s: EligibilitySnapshot,
  rule: EligibilityRule,
  settings: { offlineMaxDistanceM: number },
): EligibilityResult {
  const checks: EligibilityCheck[] = [];
  const add = (
    key: string,
    label: string,
    ok: boolean | null,
    severity: EligibilityCheck["severity"],
    detail: string | null = null,
  ) => checks.push({ key, label, ok, severity, detail });

  if (rule.require_owner_phone_verified !== false) {
    add(
      "owner_verified",
      "Owner verified their phone",
      s.ownerPhoneVerified,
      "hard",
    );
  }
  add(
    "owner_not_member",
    "Owner is not on a Field Ops team",
    !s.ownerIsTeamMember,
    "hard",
  );

  add(
    "place_published",
    "Listing is published",
    s.placeStatus === null ? null : s.placeStatus === "published",
    "hard",
    s.placeStatus ? `status: ${s.placeStatus}` : "no listing yet",
  );
  add(
    "place_not_moderated",
    "Listing is not hidden or removed",
    s.placeModerationState === null
      ? null
      : !HIDDEN.has(s.placeModerationState),
    "hard",
    s.placeModerationState ? `moderation: ${s.placeModerationState}` : null,
  );
  add(
    "owner_matches",
    "Listing is still owned by the verified owner",
    s.placeOwnerMatches,
    "hard",
  );

  const minPhotos = rule.min_photos ?? 2;
  add(
    "photos",
    `At least ${minPhotos} photo${minPhotos === 1 ? "" : "s"}`,
    s.photoCount >= minPhotos,
    "soft",
    `${s.photoCount} uploaded`,
  );
  const minChars = rule.min_description_chars ?? 80;
  add(
    "description",
    `Description of ${minChars}+ characters`,
    s.descriptionChars >= minChars,
    "soft",
    `${s.descriptionChars} characters`,
  );
  add("category", "Category set", s.hasCategory, "soft");
  if (rule.require_contact !== false) {
    add("contact", "A phone or WhatsApp number", s.hasContact, "soft");
  }
  if (rule.require_opening_hours !== false) {
    add("opening_hours", "Opening hours given", s.hasOpeningHours, "soft");
  }

  if (rule.require_inside_territory !== false) {
    add(
      "inside_territory",
      "Pin is inside the assigned territory",
      s.insideTerritory,
      "soft",
    );
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
      `Submitted within ${max} m of the business`,
      ok,
      "soft",
      s.submissionDistanceM === null
        ? "no position recorded"
        : `${s.submissionDistanceM} m away${
            s.submissionAccuracyM !== null
              ? ` (±${s.submissionAccuracyM} m)`
              : ""
          }`,
    );
  }

  add(
    "not_duplicate",
    "No strong match with an existing listing",
    !s.strongDuplicate,
    "soft",
    s.strongDuplicate
      ? s.duplicateAcknowledged
        ? "member said it's a different business"
        : "unacknowledged match"
      : null,
  );

  add("lead_verified", "Team lead verified", s.reviewVerified, "hard");
  if ((rule.release_policy ?? "holding_period") === "holding_period") {
    add(
      "holding",
      `Holding period of ${rule.holding_days ?? 7} days elapsed`,
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
  return { checks, pass: hard.length === 0 && soft.length === 0, hard, soft };
}
