import { scoreSimilarPlace } from "@abonten/core/fieldOps/duplicateScore";
import {
  type EligibilityRule,
  type EligibilitySnapshot,
  evaluateEligibility,
} from "@abonten/core/fieldOps/eligibility";
import { logger } from "@abonten/core/logger";
import { maskPhoneNumber } from "@abonten/core/normalizePhoneNumber";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import type {
  FieldOpsActivityKey,
  FieldOpsEligibilityCheck,
  FieldOpsOnboarding,
  FieldOpsOnboardingDetail,
  FieldOpsOnboardingEvent,
  FieldOpsOnboardingEvidence,
  FieldOpsSimilarPlace,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { displayName, namesFor, num } from "./fieldOpsRows";

// Row shapes and mappers for fieldops_onboarding and its evidence /
// timeline, plus the shared "detail" builder used by the member, lead and
// admin views. PII policy: the business owner's phone is masked for
// everyone except an admin with users.view_pii; the raw value never leaves
// the service otherwise.

export const EVIDENCE_BUCKET = "fieldops-evidence";
const SIGNED_URL_TTL_SECONDS = 300;

export type OnboardingRow = {
  id: string;
  client_request_id: string;
  campaign_id: string;
  team_id: string;
  member_id: string;
  member_user_id: string;
  assignment_id: string | null;
  territory_id: string | null;
  prospect_id: string | null;
  mode: string;
  kind: string;
  activity_key: string | null;
  business_name: string | null;
  business_phone_e164: string | null;
  business_whatsapp_e164: string | null;
  owner_full_name: string | null;
  owner_phone_e164: string | null;
  owner_user_id: string | null;
  owner_phone_verified_at: string | null;
  owner_is_new_account: boolean | null;
  owner_prior_places: number;
  owner_prior_events: number;
  place_id: string | null;
  event_id: string | null;
  entity_created_at: string | null;
  submission_lat: number | null;
  submission_lng: number | null;
  submission_accuracy_m: number | null;
  submission_distance_m: number | null;
  inside_territory: boolean | null;
  similar_matches: unknown;
  duplicate_acknowledged: boolean;
  status: string;
  submitted_at: string | null;
  resubmission_count: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_decision: string | null;
  review_note: string | null;
  rule_id: string | null;
  holding_until: string | null;
  flags: string[] | null;
  flag_details: unknown;
  succeeded_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
  fieldops_territory?: { name: string } | null;
  fieldops_team_member?: { full_name_snapshot: string | null } | null;
  place?: { id: string; name: string; slug: string; status: string } | null;
};

export const ONBOARDING_COLUMNS =
  "id, client_request_id, campaign_id, team_id, member_id, member_user_id, assignment_id, territory_id, prospect_id, mode, kind, activity_key, business_name, business_phone_e164, business_whatsapp_e164, owner_full_name, owner_phone_e164, owner_user_id, owner_phone_verified_at, owner_is_new_account, owner_prior_places, owner_prior_events, place_id, event_id, entity_created_at, submission_lat, submission_lng, submission_accuracy_m, submission_distance_m, inside_territory, similar_matches, duplicate_acknowledged, status, submitted_at, resubmission_count, reviewed_by, reviewed_at, review_decision, review_note, rule_id, holding_until, flags, flag_details, succeeded_at, rejected_at, rejection_reason, withdrawn_at, created_at, updated_at, fieldops_territory(name), fieldops_team_member(full_name_snapshot), place(id, name, slug, status)";

export function mapOnboarding(
  r: OnboardingRow,
  opts: { revealOwnerPhone?: boolean } = {},
): FieldOpsOnboarding {
  const mask = (v: string | null) =>
    v ? (opts.revealOwnerPhone ? v : maskPhoneNumber(v)) : null;
  return {
    id: r.id,
    campaignId: r.campaign_id,
    teamId: r.team_id,
    memberId: r.member_id,
    memberUserId: r.member_user_id,
    memberName: r.fieldops_team_member?.full_name_snapshot ?? null,
    assignmentId: r.assignment_id,
    territoryId: r.territory_id,
    territoryName: r.fieldops_territory?.name ?? null,
    prospectId: r.prospect_id,
    mode: r.mode as FieldOpsOnboarding["mode"],
    kind: r.kind as FieldOpsOnboarding["kind"],
    activityKey: r.activity_key as FieldOpsActivityKey | null,
    businessName: r.business_name,
    businessPhoneMasked: mask(r.business_phone_e164),
    ownerFullName: r.owner_full_name,
    ownerPhoneMasked: mask(r.owner_phone_e164),
    ownerVerified: r.owner_user_id !== null,
    ownerIsNewAccount: r.owner_is_new_account,
    ownerPriorPlaces: num(r.owner_prior_places),
    ownerPriorEvents: num(r.owner_prior_events),
    placeId: r.place_id,
    placeSlug: r.place?.slug ?? null,
    placeName: r.place?.name ?? null,
    placeStatus: r.place?.status ?? null,
    entityCreatedAt: r.entity_created_at,
    submissionLocation:
      r.submission_lat !== null && r.submission_lng !== null
        ? { lat: r.submission_lat, lng: r.submission_lng }
        : null,
    submissionAccuracyM: r.submission_accuracy_m,
    submissionDistanceM: r.submission_distance_m,
    insideTerritory: r.inside_territory,
    similarMatches: Array.isArray(r.similar_matches)
      ? (r.similar_matches as FieldOpsSimilarPlace[])
      : [],
    duplicateAcknowledged: r.duplicate_acknowledged,
    status: r.status as FieldOpsOnboarding["status"],
    submittedAt: r.submitted_at,
    resubmissionCount: num(r.resubmission_count),
    reviewedAt: r.reviewed_at,
    reviewDecision: r.review_decision as FieldOpsOnboarding["reviewDecision"],
    reviewNote: r.review_note,
    holdingUntil: r.holding_until,
    flags: r.flags ?? [],
    succeededAt: r.succeeded_at,
    rejectedAt: r.rejected_at,
    rejectionReason: r.rejection_reason,
    withdrawnAt: r.withdrawn_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── Evidence ────────────────────────────────────────────────

export type EvidenceRow = {
  id: string;
  onboarding_id: string;
  kind: string;
  storage_path: string;
  captured_at: string | null;
  captured_lat: number | null;
  captured_lng: number | null;
  accuracy_m: number | null;
  uploaded_at: string | null;
  created_at: string;
};

export const EVIDENCE_COLUMNS =
  "id, onboarding_id, kind, storage_path, captured_at, captured_lat, captured_lng, accuracy_m, uploaded_at, created_at";

export async function loadEvidence(
  supabase: ServiceRoleClient,
  onboardingId: string,
  opts: { sign: boolean },
): Promise<FieldOpsOnboardingEvidence[]> {
  const { data, error } = await supabase
    .from("fieldops_onboarding_evidence")
    .select(EVIDENCE_COLUMNS)
    .eq("onboarding_id", onboardingId)
    .order("created_at");
  if (error) {
    logger.error(`fieldOps loadEvidence: ${error.message}`);
    return [];
  }
  const rows = (data ?? []) as EvidenceRow[];
  const urls = new Map<string, string>();
  const uploaded = rows.filter((r) => r.uploaded_at);
  if (opts.sign && uploaded.length > 0) {
    const { data: signed } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrls(
        uploaded.map((r) => r.storage_path),
        SIGNED_URL_TTL_SECONDS,
      );
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as FieldOpsOnboardingEvidence["kind"],
    url: urls.get(r.storage_path) ?? null,
    capturedAt: r.captured_at,
    capturedLocation:
      r.captured_lat !== null && r.captured_lng !== null
        ? { lat: r.captured_lat, lng: r.captured_lng }
        : null,
    accuracyM: r.accuracy_m,
    uploadedAt: r.uploaded_at,
    createdAt: r.created_at,
  }));
}

/**
 * Marks evidence rows whose object now exists in the bucket as uploaded
 * (the browser uploads straight to storage with a signed URL, so the
 * service only learns about it here). Returns the uploaded rows.
 */
export async function confirmEvidenceUploads(
  supabase: ServiceRoleClient,
  campaignId: string,
  onboardingId: string,
): Promise<EvidenceRow[]> {
  const { data: rows } = await supabase
    .from("fieldops_onboarding_evidence")
    .select(EVIDENCE_COLUMNS)
    .eq("onboarding_id", onboardingId);
  const evidence = (rows ?? []) as EvidenceRow[];
  const pending = evidence.filter((r) => !r.uploaded_at);
  if (pending.length > 0) {
    const { data: objects } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .list(`${campaignId}/${onboardingId}`, { limit: 100 });
    const names = new Set((objects ?? []).map((o) => o.name));
    const now = new Date().toISOString();
    for (const r of pending) {
      const file = r.storage_path.split("/").pop() ?? "";
      if (names.has(file)) {
        await supabase
          .from("fieldops_onboarding_evidence")
          .update({ uploaded_at: now } as never)
          .eq("id", r.id);
        r.uploaded_at = now;
      }
    }
  }
  return evidence.filter((r) => r.uploaded_at);
}

// ── Timeline ────────────────────────────────────────────────

export async function loadTimeline(
  supabase: ServiceRoleClient,
  onboardingId: string,
): Promise<FieldOpsOnboardingEvent[]> {
  const { data } = await supabase
    .from("fieldops_onboarding_event")
    .select(
      "id, from_status, to_status, actor_user_id, actor_kind, note, details, created_at",
    )
    .eq("onboarding_id", onboardingId)
    .order("id");
  const rows = data ?? [];
  const names = await namesFor(
    supabase,
    rows.map((r) => r.actor_user_id),
  );
  return rows.map((r) => ({
    id: Number(r.id),
    fromStatus: r.from_status,
    toStatus: r.to_status,
    actorKind: r.actor_kind as FieldOpsOnboardingEvent["actorKind"],
    actorName: r.actor_user_id ? displayName(names.get(r.actor_user_id)) : null,
    note: r.note,
    details: (r.details ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
  }));
}

export async function appendTimeline(
  supabase: ServiceRoleClient,
  input: {
    onboardingId: string;
    status: string;
    actorUserId: string | null;
    actorKind: FieldOpsOnboardingEvent["actorKind"];
    note?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("fieldops_onboarding_event").insert({
    onboarding_id: input.onboardingId,
    from_status: input.status,
    to_status: input.status,
    actor_user_id: input.actorUserId,
    actor_kind: input.actorKind,
    note: input.note ?? null,
    details: input.details ?? {},
  } as never);
  if (error) logger.error(`fieldOps appendTimeline: ${error.message}`);
}

// ── Settings, rules ─────────────────────────────────────────

export type ProgramSettingsRow = {
  program_enabled: boolean;
  worker_ui_enabled: boolean;
  require_member_phone_verified: boolean;
  default_holding_days: number;
  duplicate_radius_m: number;
  duplicate_name_similarity: number | string;
  offline_max_distance_m: number;
  daily_submission_cap: number;
  notify_push_enabled: boolean;
};

export async function readProgramSettings(
  supabase: ServiceRoleClient,
): Promise<ProgramSettingsRow> {
  const { data } = await supabase
    .from("fieldops_program_setting")
    .select(
      "program_enabled, worker_ui_enabled, require_member_phone_verified, default_holding_days, duplicate_radius_m, duplicate_name_similarity, offline_max_distance_m, daily_submission_cap, notify_push_enabled",
    )
    .eq("id", 1)
    .maybeSingle();
  return (
    (data as ProgramSettingsRow | null) ?? {
      program_enabled: false,
      worker_ui_enabled: true,
      require_member_phone_verified: true,
      default_holding_days: 7,
      duplicate_radius_m: 300,
      duplicate_name_similarity: 0.45,
      offline_max_distance_m: 200,
      daily_submission_cap: 8,
      notify_push_enabled: true,
    }
  );
}

export type LiveRule = {
  id: string;
  amountMinor: number;
  currency: string;
  eligibility: EligibilityRule;
};

/** The rule in force for an activity: the campaign's own version, else the programme default. */
export async function liveRuleFor(
  supabase: ServiceRoleClient,
  campaignId: string,
  activityKey: string,
): Promise<LiveRule | null> {
  const { data } = await supabase
    .from("fieldops_commission_rule")
    .select("id, campaign_id, amount_minor, currency, eligibility")
    .eq("activity_key", activityKey)
    .eq("is_active", true)
    .or(`campaign_id.eq.${campaignId},campaign_id.is.null`);
  const rows = data ?? [];
  const pick =
    rows.find((r) => r.campaign_id === campaignId) ??
    rows.find((r) => r.campaign_id === null);
  if (!pick) return null;
  return {
    id: pick.id,
    amountMinor: num(pick.amount_minor),
    currency: pick.currency,
    eligibility: (pick.eligibility ?? {}) as EligibilityRule,
  };
}

// ── Similar places ──────────────────────────────────────────

export async function findSimilarPlaces(
  supabase: ServiceRoleClient,
  input: {
    name: string;
    lat: number;
    lng: number;
    phoneE164?: string | null;
    whatsappE164?: string | null;
    excludePlaceId?: string | null;
  },
  settings: ProgramSettingsRow,
): Promise<FieldOpsSimilarPlace[]> {
  const radiusM = num(settings.duplicate_radius_m) || 300;
  const similarityThreshold = num(settings.duplicate_name_similarity) || 0.45;
  const { data, error } = await supabase.rpc("fieldops_find_similar_places", {
    p_name: input.name,
    p_lat: input.lat,
    p_lng: input.lng,
    p_phone: input.phoneE164 ?? undefined,
    p_whatsapp: input.whatsappE164 ?? undefined,
    p_radius_m: radiusM,
    p_similarity: similarityThreshold,
    p_limit: 8,
  });
  if (error) {
    logger.error(`fieldOps findSimilarPlaces: ${error.message}`);
    return [];
  }
  return (data ?? [])
    .filter((r) => r.id !== input.excludePlaceId)
    .map((r) => {
      const signal = {
        similarity: num(r.similarity),
        distanceM: num(r.distance_m),
        phoneMatch: Boolean(r.phone_match),
      };
      const { score, strong } = scoreSimilarPlace(signal, {
        radiusM,
        similarityThreshold,
      });
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        distanceM: signal.distanceM,
        similarity: signal.similarity,
        phoneMatch: signal.phoneMatch,
        score,
        strong,
        createdAt: r.created_at,
      };
    });
}

// ── Detail (member / lead / admin) ──────────────────────────

type PlaceDetailRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  moderation_state: string;
  description: string;
  address: unknown;
  location: unknown;
  phone: string | null;
  whatsapp: string | null;
  owner_id: string;
  cover_public_id: string;
  cover_version: string;
  place_category: { name: string } | null;
  place_photo: { count: number }[];
  place_opening_hours: { count: number }[];
};

export async function buildOnboardingDetail(
  supabase: ServiceRoleClient,
  row: OnboardingRow,
  opts: { revealOwnerPhone: boolean },
): Promise<FieldOpsOnboardingDetail> {
  const [evidence, timeline, settings, placeRes, memberPhone] =
    await Promise.all([
      loadEvidence(supabase, row.id, { sign: true }),
      loadTimeline(supabase, row.id),
      readProgramSettings(supabase),
      row.place_id
        ? supabase
            .from("place")
            .select(
              "id, name, slug, status, moderation_state, description, address, location, phone, whatsapp, owner_id, cover_public_id, cover_version, place_category(name), place_photo(count), place_opening_hours(count)",
            )
            .eq("id", row.place_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      row.owner_phone_e164
        ? supabase.rpc("fieldops_phone_belongs_to_member", {
            p_phone_e164: row.owner_phone_e164,
          })
        : Promise.resolve({ data: false }),
    ]);

  const placeRow = (placeRes.data as unknown as PlaceDetailRow | null) ?? null;
  let placeLocation: { lat: number; lng: number } | null = null;
  if (placeRow?.location && typeof placeRow.location === "string") {
    try {
      const p = parseWKBHex(placeRow.location);
      placeLocation = { lat: p.eventLat, lng: p.eventLng };
    } catch {
      placeLocation = null;
    }
  }
  const photoCount = placeRow ? 1 + num(placeRow.place_photo?.[0]?.count) : 0;
  const hasOpeningHours = placeRow
    ? num(placeRow.place_opening_hours?.[0]?.count) > 0
    : false;
  const hasContact = Boolean(placeRow?.phone || placeRow?.whatsapp);
  const address =
    placeRow?.address && typeof placeRow.address === "object"
      ? ((placeRow.address as { full_address?: string }).full_address ?? null)
      : null;

  const activityKey =
    row.activity_key ??
    (row.mode === "offline"
      ? "place_onboarding_offline"
      : "place_onboarding_online");
  const rule = await liveRuleFor(supabase, row.campaign_id, activityKey);
  const eligibility: EligibilityRule = rule?.eligibility ?? {
    holding_days: num(settings.default_holding_days),
    min_photos: 2,
    require_owner_phone_verified: true,
    require_inside_territory: true,
    min_description_chars: 80,
    require_opening_hours: true,
    require_contact: true,
    release_policy: "holding_period",
  };
  const matches = Array.isArray(row.similar_matches)
    ? (row.similar_matches as FieldOpsSimilarPlace[])
    : [];
  const snapshot: EligibilitySnapshot = {
    mode: row.mode as "offline" | "online",
    ownerPhoneVerified: row.owner_user_id !== null,
    ownerIsTeamMember: memberPhone.data === true,
    placeStatus: placeRow?.status ?? null,
    placeModerationState: placeRow?.moderation_state ?? null,
    placeOwnerMatches: placeRow
      ? placeRow.owner_id === row.owner_user_id
      : null,
    photoCount,
    descriptionChars: placeRow?.description?.length ?? 0,
    hasCategory: Boolean(placeRow?.place_category),
    hasContact,
    hasOpeningHours,
    insideTerritory: row.inside_territory,
    submissionDistanceM: row.submission_distance_m,
    submissionAccuracyM: row.submission_accuracy_m,
    strongDuplicate: matches.some((m) => m.strong),
    duplicateAcknowledged: row.duplicate_acknowledged,
    reviewVerified: ["verified", "flagged", "succeeded"].includes(row.status),
    holdingElapsed: row.holding_until
      ? new Date(row.holding_until).getTime() <= Date.now()
      : null,
  };
  const checks: FieldOpsEligibilityCheck[] = evaluateEligibility(
    snapshot,
    eligibility,
    { offlineMaxDistanceM: num(settings.offline_max_distance_m) || 200 },
  ).checks;

  return {
    onboarding: mapOnboarding(row, opts),
    evidence,
    timeline,
    place: placeRow
      ? {
          id: placeRow.id,
          name: placeRow.name,
          slug: placeRow.slug,
          status: placeRow.status,
          description: placeRow.description,
          categoryName: placeRow.place_category?.name ?? null,
          address,
          location: placeLocation,
          coverPublicId: placeRow.cover_public_id,
          coverVersion: placeRow.cover_version,
          photoCount,
          hasOpeningHours,
          hasContact,
          ownerMatches: placeRow.owner_id === row.owner_user_id,
        }
      : null,
    checks,
    rule: rule
      ? {
          id: rule.id,
          amountMinor: rule.amountMinor,
          currency: rule.currency,
          holdingDays:
            rule.eligibility.holding_days ?? num(settings.default_holding_days),
        }
      : null,
  };
}
