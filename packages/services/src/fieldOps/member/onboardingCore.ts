import { distanceMetres } from "@abonten/core/fieldOps/territory";
import { logger } from "@abonten/core/logger";
import type {
  FieldOpsOnboarding,
  FieldOpsOnboardingDetail,
  FieldOpsOnboardingDraft,
  FieldOpsOnboardingStatus,
  FieldOpsSimilarPlace,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { FieldOpsPlaceDetailsInput } from "@abonten/validation/fieldOpsSchemas";
import { postPlaceCore } from "../../places/postPlaceCore";
import { getResendCooldownRemainingMs } from "../../profile/phoneOtpStore";
import {
  type FieldOpsContext,
  FieldOpsForbiddenError,
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import {
  type FieldOpsEnvelope,
  dbErr,
  notifyFieldOps,
  pointWkt,
  todayIso,
} from "../shared/fieldOpsRows";
import {
  ONBOARDING_COLUMNS,
  type OnboardingRow,
  appendTimeline,
  buildOnboardingDetail,
  confirmEvidenceUploads,
  findSimilarPlaces,
  loadEvidence,
  mapOnboarding,
  readProgramSettings,
} from "../shared/onboardingRows";
import { consentPathFor } from "./ownerOtpCore";

// The onboarding wizard, server side: start a draft, look for duplicates,
// submit (which creates the real place, owned by the OTP-verified owner),
// withdraw, and read back. The owner OTP steps live in ownerOtpCore, the
// evidence uploads in evidenceCore, the team lead's decision in
// lead/reviewCore. Every entry point re-derives the caller's membership.

const FIELD_ROLES = ["offline_member", "online_member"] as const;
const SUBMITTING_STATUSES = new Set(["active", "winding_down"]);

async function loadOwnOnboarding(
  supabase: ServiceRoleClient,
  userId: string,
  campaignId: string,
  onboardingId: string,
): Promise<OnboardingRow | null> {
  const { data } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", onboardingId)
    .eq("campaign_id", campaignId)
    .eq("member_user_id", userId)
    .maybeSingle();
  return (data as unknown as OnboardingRow | null) ?? null;
}

async function memberContext(
  supabase: ServiceRoleClient,
  userId: string,
  campaignId: string,
): Promise<{
  ctx: FieldOpsContext;
  membershipId: string;
  teamId: string;
  mode: "offline" | "online";
  campaignStatus: string;
  regionId: string;
}> {
  const ctx = await resolveFieldOpsContext(supabase, userId);
  const m = requireMembership(ctx, campaignId, FIELD_ROLES);
  return {
    ctx,
    membershipId: m.membershipId,
    teamId: m.teamId,
    mode: m.role === "offline_member" ? "offline" : "online",
    campaignStatus: m.campaignStatus,
    regionId: m.regionId,
  };
}

// ── Start ───────────────────────────────────────────────────

export type StartOnboardingInput = {
  campaignId: string;
  territoryId: string;
  prospectId?: string | null;
  clientRequestId?: string;
};

/**
 * Opens a draft onboarding in a territory the member holds an open
 * assignment for (idempotent on clientRequestId). The daily submission cap
 * counts submissions, not drafts, so an abandoned draft costs nothing.
 */
export async function startOnboardingCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: StartOnboardingInput,
): Promise<FieldOpsEnvelope<FieldOpsOnboarding>> {
  let m: Awaited<ReturnType<typeof memberContext>>;
  try {
    m = await memberContext(supabase, userId, input.campaignId);
  } catch (e) {
    return fieldOpsError(e);
  }
  if (m.campaignStatus !== "active") {
    return {
      status: 409,
      message: "The campaign isn't taking new onboardings.",
    };
  }
  if (input.clientRequestId) {
    const { data: existing } = await supabase
      .from("fieldops_onboarding")
      .select(ONBOARDING_COLUMNS)
      .eq("client_request_id", input.clientRequestId)
      .eq("member_user_id", userId)
      .maybeSingle();
    if (existing) {
      return {
        status: 200,
        data: mapOnboarding(existing as unknown as OnboardingRow),
      };
    }
  }
  const { data: assignment } = await supabase
    .from("fieldops_assignment")
    .select("id")
    .eq("campaign_id", input.campaignId)
    .eq("member_user_id", userId)
    .eq("territory_id", input.territoryId)
    .in("status", ["assigned", "started"])
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!assignment) {
    return {
      status: 409,
      message: "You need an open assignment in this territory to onboard here.",
    };
  }
  let prospect: {
    id: string;
    name: string;
    contact_phone_e164: string | null;
    onboarding_id: string | null;
  } | null = null;
  if (input.prospectId) {
    const { data } = await supabase
      .from("fieldops_prospect")
      .select(
        "id, name, contact_phone_e164, onboarding_id, member_user_id, territory_id",
      )
      .eq("id", input.prospectId)
      .eq("campaign_id", input.campaignId)
      .maybeSingle();
    if (
      !data ||
      data.member_user_id !== userId ||
      data.territory_id !== input.territoryId
    ) {
      return { status: 404, message: "Business not found in this territory" };
    }
    if (data.onboarding_id) {
      const { data: open } = await supabase
        .from("fieldops_onboarding")
        .select(ONBOARDING_COLUMNS)
        .eq("id", data.onboarding_id)
        .maybeSingle();
      if (
        open &&
        !["rejected", "withdrawn"].includes(
          (open as unknown as OnboardingRow).status,
        )
      ) {
        return {
          status: 200,
          message: "Continuing the onboarding you already started.",
          data: mapOnboarding(open as unknown as OnboardingRow),
        };
      }
    }
    prospect = data;
  }

  const { data, error } = await supabase
    .from("fieldops_onboarding")
    .insert({
      ...(input.clientRequestId
        ? { client_request_id: input.clientRequestId }
        : {}),
      campaign_id: input.campaignId,
      team_id: m.teamId,
      member_id: m.membershipId,
      member_user_id: userId,
      assignment_id: assignment.id,
      territory_id: input.territoryId,
      prospect_id: prospect?.id ?? null,
      mode: m.mode,
      kind: "place",
      business_name: prospect?.name ?? null,
      business_phone_e164: prospect?.contact_phone_e164 ?? null,
    } as never)
    .select(ONBOARDING_COLUMNS)
    .single();
  if (error || !data) {
    return dbErr(
      error ?? { message: "insert failed" },
      "Could not start the onboarding",
    );
  }
  const row = data as unknown as OnboardingRow;
  if (prospect) {
    await supabase
      .from("fieldops_prospect")
      .update({ onboarding_id: row.id } as never)
      .eq("id", prospect.id);
  }
  await appendTimeline(supabase, {
    onboardingId: row.id,
    status: "draft",
    actorUserId: userId,
    actorKind: "member",
    note: "Started",
  });
  return { status: 200, data: mapOnboarding(row) };
}

// ── Read back ───────────────────────────────────────────────

export async function getOnboardingDraftCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; onboardingId: string },
): Promise<FieldOpsEnvelope<FieldOpsOnboardingDraft>> {
  try {
    await memberContext(supabase, userId, input.campaignId);
  } catch (e) {
    return fieldOpsError(e);
  }
  const row = await loadOwnOnboarding(
    supabase,
    userId,
    input.campaignId,
    input.onboardingId,
  );
  if (!row) return { status: 404, message: "Onboarding not found" };
  const [evidence, settings, cooldownMs] = await Promise.all([
    loadEvidence(supabase, row.id, { sign: true }),
    readProgramSettings(supabase),
    row.owner_phone_e164 && !row.owner_user_id
      ? getResendCooldownRemainingMs("fieldops-owner", row.owner_phone_e164)
      : Promise.resolve(0),
  ]);
  return {
    status: 200,
    data: {
      onboarding: mapOnboarding(row),
      evidence,
      ownerOtp: {
        resendInSeconds: Math.ceil(cooldownMs / 1000),
        consentPath:
          row.mode === "online" && row.owner_phone_e164 && !row.owner_user_id
            ? consentPathFor(row.id, row.owner_phone_e164)
            : null,
      },
      duplicateRadiusM: Number(settings.duplicate_radius_m) || 300,
    },
  };
}

export async function listMyOnboardingsCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; status?: FieldOpsOnboardingStatus },
): Promise<FieldOpsEnvelope<FieldOpsOnboarding[]>> {
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    requireMembership(ctx, input.campaignId);
  } catch (e) {
    return fieldOpsError(e);
  }
  let q = supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("campaign_id", input.campaignId)
    .eq("member_user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (input.status) q = q.eq("status", input.status);
  const { data, error } = await q;
  if (error) return dbErr(error, "Could not load your onboardings");
  return {
    status: 200,
    data: ((data ?? []) as unknown as OnboardingRow[]).map((r) =>
      mapOnboarding(r),
    ),
  };
}

/** Full detail for the member who owns it or the lead of its team. */
export async function getOnboardingDetailCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; onboardingId: string },
): Promise<FieldOpsEnvelope<FieldOpsOnboardingDetail>> {
  let isLead = false;
  let teamId = "";
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId);
    isLead = m.role === "team_lead";
    teamId = m.teamId;
  } catch (e) {
    return fieldOpsError(e);
  }
  const { data } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", input.onboardingId)
    .eq("campaign_id", input.campaignId)
    .maybeSingle();
  const row = data as unknown as OnboardingRow | null;
  if (!row) return { status: 404, message: "Onboarding not found" };
  const allowed = isLead
    ? row.team_id === teamId
    : row.member_user_id === userId;
  if (!allowed) return { status: 404, message: "Onboarding not found" };
  return {
    status: 200,
    data: await buildOnboardingDetail(supabase, row, {
      revealOwnerPhone: false,
    }),
  };
}

// ── Duplicate search ────────────────────────────────────────

export async function searchSimilarPlacesCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    campaignId: string;
    onboardingId: string;
    name: string;
    location: { lat: number; lng: number };
    phoneE164?: string | null;
    whatsappE164?: string | null;
  },
): Promise<FieldOpsEnvelope<FieldOpsSimilarPlace[]>> {
  try {
    await memberContext(supabase, userId, input.campaignId);
  } catch (e) {
    return fieldOpsError(e);
  }
  const row = await loadOwnOnboarding(
    supabase,
    userId,
    input.campaignId,
    input.onboardingId,
  );
  if (!row) return { status: 404, message: "Onboarding not found" };
  const settings = await readProgramSettings(supabase);
  const matches = await findSimilarPlaces(
    supabase,
    {
      ...input,
      lat: input.location.lat,
      lng: input.location.lng,
      excludePlaceId: row.place_id,
    },
    settings,
  );
  return { status: 200, data: matches };
}

// ── Submit ──────────────────────────────────────────────────

export type SubmitOnboardingInput = {
  campaignId: string;
  onboardingId: string;
  place: FieldOpsPlaceDetailsInput;
  submissionLocation?: { lat: number; lng: number } | null;
  submissionAccuracyM?: number | null;
  duplicateAcknowledged?: boolean;
};

/**
 * Creates the real place (owned by the verified owner, through the same
 * postPlaceCore every place goes through), records where the member was,
 * snapshots the duplicate search, and hands the onboarding to the team
 * lead. Retry-safe: the place is keyed by the onboarding's
 * client_request_id, so a second call after a partial failure finds it.
 */
export async function submitOnboardingCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: SubmitOnboardingInput,
): Promise<FieldOpsEnvelope<FieldOpsOnboarding>> {
  let m: Awaited<ReturnType<typeof memberContext>>;
  try {
    m = await memberContext(supabase, userId, input.campaignId);
  } catch (e) {
    return fieldOpsError(e);
  }
  const row = await loadOwnOnboarding(
    supabase,
    userId,
    input.campaignId,
    input.onboardingId,
  );
  if (!row) return { status: 404, message: "Onboarding not found" };
  if (row.status !== "draft" && row.status !== "needs_changes") {
    return {
      status: 409,
      message: "This onboarding has already been submitted.",
    };
  }
  if (!SUBMITTING_STATUSES.has(m.campaignStatus)) {
    return {
      status: 409,
      message: "The campaign isn't taking submissions right now.",
    };
  }
  if (m.campaignStatus === "winding_down" && row.status !== "needs_changes") {
    return {
      status: 409,
      message:
        "The campaign is winding down: only fixes to returned onboardings can be sent.",
    };
  }
  if (!row.owner_user_id) {
    return {
      status: 409,
      message: "The owner has to verify their phone before you can submit.",
    };
  }
  const settings = await readProgramSettings(supabase);

  // Daily cap on submissions per member.
  const today = todayIso();
  const { count: submittedToday } = await supabase
    .from("fieldops_onboarding")
    .select("id", { count: "exact", head: true })
    .eq("member_user_id", userId)
    .gte("submitted_at", `${today}T00:00:00Z`)
    .neq("id", row.id);
  if ((submittedToday ?? 0) >= Number(settings.daily_submission_cap)) {
    return {
      status: 429,
      message: "You've reached today's submission limit. Continue tomorrow.",
    };
  }

  // Photos must have been uploaded under this member's own signed folder.
  const folder = `place_photos/${userId}/`;
  const photoIds = [
    input.place.cover.publicId,
    ...(input.place.photos ?? []).map((p) => p.publicId),
  ];
  if (photoIds.some((id) => !id.startsWith(folder))) {
    return {
      status: 403,
      message: "One of the photos wasn't uploaded from this account.",
    };
  }

  // Offline work: the member's position is required.
  if (row.mode === "offline" && !input.submissionLocation) {
    return {
      status: 400,
      message: "Turn on location so we can record that you're at the business.",
    };
  }

  // Evidence: offline needs a storefront and an interior photo.
  const evidence = await confirmEvidenceUploads(
    supabase,
    row.campaign_id,
    row.id,
  );
  if (row.mode === "offline") {
    const kinds = new Set(evidence.map((e) => e.kind));
    if (!kinds.has("storefront") || !kinds.has("interior")) {
      return {
        status: 400,
        message:
          "Add a storefront photo and an interior photo before submitting.",
      };
    }
  }

  // Duplicate guard, re-run server-side with the final details.
  const matches = await findSimilarPlaces(
    supabase,
    {
      name: input.place.name,
      lat: input.place.location.lat,
      lng: input.place.location.lng,
      phoneE164: input.place.phoneE164 ?? null,
      whatsappE164: input.place.whatsappE164 ?? null,
      excludePlaceId: row.place_id,
    },
    settings,
  );
  const strong = matches.filter((x) => x.strong);
  if (strong.length > 0 && !input.duplicateAcknowledged) {
    return {
      status: 409,
      message: `This looks like ${strong[0]?.name} which is already on Abonten. If it's a different business, confirm and submit again.`,
    };
  }
  if (strong.some((x) => x.phoneMatch)) {
    // The same phone as an existing listing is never a "different business".
    return {
      status: 409,
      message: `${strong.find((x) => x.phoneMatch)?.name} already uses this phone number on Abonten. Claim assistance for existing listings arrives in a later update.`,
    };
  }

  // Create (or find) the place under the OWNER's id.
  let placeId = row.place_id;
  if (!placeId) {
    const { data: existing } = await supabase
      .from("place")
      .select("id")
      .eq("client_request_id", row.client_request_id)
      .maybeSingle();
    placeId = existing?.id ?? null;
  }
  if (!placeId) {
    const created = await postPlaceCore(supabase, row.owner_user_id, {
      name: input.place.name,
      categoryId: input.place.categoryId,
      description: input.place.description,
      address: input.place.address,
      latitude: input.place.location.lat,
      longitude: input.place.location.lng,
      websiteUrl: input.place.websiteUrl ?? null,
      phone: input.place.phoneE164 ?? null,
      whatsapp: input.place.whatsappE164 ?? null,
      coverPublicId: input.place.cover.publicId,
      coverVersion: input.place.cover.version,
      openingHours: input.place.openingHours ?? [],
      clientRequestId: row.client_request_id,
    });
    if (created.status !== 200) {
      return { status: created.status, message: created.message };
    }
    placeId = created.placeId;
    const photos = input.place.photos ?? [];
    if (photos.length > 0) {
      const { error: photoErr } = await supabase.from("place_photo").insert(
        photos.map((p, i) => ({
          place_id: placeId,
          public_id: p.publicId,
          version: p.version,
          position: i,
        })) as never,
      );
      if (photoErr) logger.error(`fieldOps place photos: ${photoErr.message}`);
    }
  }

  // Where the member was, and whether the pin is in the territory.
  const distance = input.submissionLocation
    ? Math.round(distanceMetres(input.submissionLocation, input.place.location))
    : null;
  let inside: boolean | null = null;
  if (row.territory_id) {
    const { data } = await supabase.rpc("fieldops_territory_contains", {
      p_territory_id: row.territory_id,
      p_lat: input.place.location.lat,
      p_lng: input.place.location.lng,
    });
    inside = data === true;
  }

  const { error: updErr } = await supabase
    .from("fieldops_onboarding")
    .update({
      activity_key:
        row.mode === "offline"
          ? "place_onboarding_offline"
          : "place_onboarding_online",
      business_name: input.place.name,
      business_phone_e164: input.place.phoneE164 ?? null,
      business_whatsapp_e164: input.place.whatsappE164 ?? null,
      place_id: placeId,
      entity_created_at: row.entity_created_at ?? new Date().toISOString(),
      submission_location: input.submissionLocation
        ? pointWkt(input.submissionLocation)
        : null,
      submission_accuracy_m:
        input.submissionAccuracyM === null ||
        input.submissionAccuracyM === undefined
          ? null
          : Math.round(input.submissionAccuracyM),
      submission_distance_m: distance,
      inside_territory: inside,
      similar_matches: matches,
      duplicate_acknowledged: Boolean(input.duplicateAcknowledged),
    } as never)
    .eq("id", row.id);
  if (updErr) {
    if (updErr.code === "23505") {
      return {
        status: 409,
        message: "This business has already been onboarded.",
      };
    }
    return dbErr(updErr, "Could not save the submission");
  }

  const { data: moved, error: trErr } = await supabase.rpc(
    "fieldops_transition_onboarding",
    {
      p_onboarding_id: row.id,
      p_to: "submitted",
      p_actor: userId,
      p_actor_kind: "member",
      p_note: undefined,
      p_details: {
        distance_m: distance,
        inside_territory: inside,
        evidence: evidence.length,
      },
    },
  );
  if (trErr) return dbErr(trErr, "Could not submit");

  if (row.prospect_id) {
    await supabase
      .from("fieldops_prospect")
      .update({ status: "converted", onboarding_id: row.id } as never)
      .eq("id", row.prospect_id);
  }
  const { data: leads } = await supabase
    .from("fieldops_team_member")
    .select("user_id")
    .eq("team_id", row.team_id)
    .eq("role", "team_lead")
    .eq("status", "active");
  await notifyFieldOps(
    supabase,
    (leads ?? []).map((l) => l.user_id).filter((id): id is string => !!id),
    {
      type: "fieldops_submission_received",
      title: `Review: ${input.place.name}`,
      body: `${row.fieldops_team_member?.full_name_snapshot ?? "A member"} submitted a new business.`,
      route: `/field/lead/review/${row.id}`,
    },
  );

  const fresh = await loadOwnOnboarding(
    supabase,
    userId,
    input.campaignId,
    row.id,
  );
  return {
    status: 200,
    message: "Submitted. Your team lead will review it.",
    data: mapOnboarding(
      (fresh ?? (moved as unknown as OnboardingRow)) as OnboardingRow,
    ),
  };
}

// ── Withdraw ────────────────────────────────────────────────

export async function withdrawOnboardingCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; onboardingId: string; reason?: string | null },
): Promise<FieldOpsEnvelope<FieldOpsOnboarding>> {
  try {
    await memberContext(supabase, userId, input.campaignId);
  } catch (e) {
    return fieldOpsError(e);
  }
  const row = await loadOwnOnboarding(
    supabase,
    userId,
    input.campaignId,
    input.onboardingId,
  );
  if (!row) return { status: 404, message: "Onboarding not found" };
  if (!["draft", "submitted", "needs_changes"].includes(row.status)) {
    return {
      status: 409,
      message: "This onboarding can no longer be withdrawn.",
    };
  }
  const { data, error } = await supabase.rpc("fieldops_transition_onboarding", {
    p_onboarding_id: row.id,
    p_to: "withdrawn",
    p_actor: userId,
    p_actor_kind: "member",
    p_note: input.reason ?? undefined,
    p_details: {},
  });
  if (error) return dbErr(error, "Could not withdraw");
  if (row.prospect_id) {
    await supabase
      .from("fieldops_prospect")
      .update({ onboarding_id: null } as never)
      .eq("id", row.prospect_id)
      .eq("onboarding_id", row.id);
  }
  const fresh = await loadOwnOnboarding(
    supabase,
    userId,
    input.campaignId,
    row.id,
  );
  return {
    status: 200,
    message: "Withdrawn.",
    data: mapOnboarding(
      (fresh ?? (data as unknown as OnboardingRow)) as OnboardingRow,
    ),
  };
}

export { FieldOpsForbiddenError };
