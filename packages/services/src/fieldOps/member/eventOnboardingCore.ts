import { distanceMetres } from "@abonten/core/fieldOps/territory";
import { logger } from "@abonten/core/logger";
import type { FieldOpsOnboarding } from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { postEventCore } from "../../events/postEventCore";
import {
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
  confirmEvidenceUploads,
  mapOnboarding,
  readProgramSettings,
} from "../shared/onboardingRows";

// Onboarding an event works exactly like a place: the organiser proves the
// number is theirs with an OTP, and the event is created through the same
// create_event path everyone else uses, owned by the organiser from the
// first second. The one real difference is when the money is earned -- an
// event that never happens pays nothing, so the commission waits until
// `starts_at` has passed and the event was neither cancelled nor moderated
// away (release_policy `event_started`, checked by the sweep).

const SUBMITTING = new Set(["active", "winding_down"]);

export type SubmitEventOnboardingInput = {
  campaignId: string;
  onboardingId: string;
  event: {
    title: string;
    description: string;
    category: string;
    types: string[];
    address: string;
    location: { lat: number; lng: number };
    startsAt: string;
    endsAt: string;
    capacity?: number | null;
    websiteUrl?: string | null;
    requireRegistration: boolean;
    freeEvent: boolean;
    singleTicket?: { price: number; quantity: number | null } | null;
    flyer: { publicId: string; version: string };
  };
  submissionLocation?: { lat: number; lng: number } | null;
  submissionAccuracyM?: number | null;
};

export async function submitEventOnboardingCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: SubmitEventOnboardingInput,
): Promise<FieldOpsEnvelope<FieldOpsOnboarding>> {
  let teamId: string;
  let campaignStatus: string;
  let mode: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId, [
      "offline_member",
      "online_member",
    ]);
    teamId = m.teamId;
    campaignStatus = m.campaignStatus;
    mode = m.role === "offline_member" ? "offline" : "online";
  } catch (e) {
    return fieldOpsError(e);
  }
  if (!SUBMITTING.has(campaignStatus)) {
    return {
      status: 409,
      message: "The campaign isn't taking submissions right now.",
    };
  }

  const { data } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", input.onboardingId)
    .eq("campaign_id", input.campaignId)
    .eq("member_user_id", userId)
    .maybeSingle();
  const row = data as unknown as OnboardingRow | null;
  if (!row) return { status: 404, message: "Onboarding not found" };
  if (row.kind !== "event") {
    return { status: 409, message: "This onboarding is for a business." };
  }
  if (row.status !== "draft" && row.status !== "needs_changes") {
    return { status: 409, message: "This onboarding has already been sent." };
  }
  if (!row.owner_user_id) {
    return {
      status: 409,
      message: "The organiser has to verify their phone before you submit.",
    };
  }

  const settings = await readProgramSettings(supabase);
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

  // The flyer must have come from this member's own signed upload folder.
  if (!input.event.flyer.publicId.startsWith(`event_flyers/${userId}/`)) {
    return {
      status: 403,
      message: "The flyer wasn't uploaded from this account.",
    };
  }

  const startsAt = new Date(input.event.startsAt);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
    return {
      status: 400,
      message: "An event has to start in the future.",
    };
  }

  if (mode === "offline" && !input.submissionLocation) {
    return {
      status: 400,
      message: "Turn on location so we can record that you met the organiser.",
    };
  }
  const evidence = await confirmEvidenceUploads(
    supabase,
    row.campaign_id,
    row.id,
  );

  // Create (or find) the event under the ORGANISER's id, through the same
  // RPC the organiser would use themselves.
  let eventId = row.event_id;
  if (!eventId) {
    const { data: existing } = await supabase
      .from("event")
      .select("id")
      .eq("client_request_id", row.client_request_id)
      .maybeSingle();
    eventId = existing?.id ?? null;
  }
  if (!eventId) {
    const created = await postEventCore(supabase, row.owner_user_id, {
      title: input.event.title,
      description: input.event.description,
      category: input.event.category,
      types: input.event.types,
      address: input.event.address,
      latitude: input.event.location.lat,
      longitude: input.event.location.lng,
      capacity: input.event.capacity ?? null,
      websiteUrl: input.event.websiteUrl ?? null,
      requireRegistration: input.event.requireRegistration,
      currency: "GHS",
      startsAt: input.event.startsAt,
      endsAt: input.event.endsAt,
      freeEvent: input.event.freeEvent,
      singleTicket: input.event.freeEvent
        ? null
        : (input.event.singleTicket ?? null),
      flyerPublicId: input.event.flyer.publicId,
      flyerVersion: input.event.flyer.version,
      clientRequestId: row.client_request_id,
    });
    if (created.status !== 200) {
      return { status: created.status, message: created.message };
    }
    eventId = created.eventId;
  }

  const distance = input.submissionLocation
    ? Math.round(distanceMetres(input.submissionLocation, input.event.location))
    : null;
  let inside: boolean | null = null;
  if (row.territory_id) {
    const { data: contains } = await supabase.rpc(
      "fieldops_territory_contains",
      {
        p_territory_id: row.territory_id,
        p_lat: input.event.location.lat,
        p_lng: input.event.location.lng,
      },
    );
    inside = contains === true;
  }

  const { error: updErr } = await supabase
    .from("fieldops_onboarding")
    .update({
      activity_key:
        mode === "offline"
          ? "event_onboarding_offline"
          : "event_onboarding_online",
      business_name: input.event.title,
      event_id: eventId,
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
    } as never)
    .eq("id", row.id);
  if (updErr) {
    if (updErr.code === "23505") {
      return { status: 409, message: "This event has already been onboarded." };
    }
    return dbErr(updErr, "Could not save the submission");
  }

  const { error: trErr } = await supabase.rpc(
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
        starts_at: input.event.startsAt,
      },
    },
  );
  if (trErr) return dbErr(trErr, "Could not submit");

  await appendTimeline(supabase, {
    onboardingId: row.id,
    status: "submitted",
    actorUserId: userId,
    actorKind: "member",
    note: `Event listed for ${startsAt.toDateString()}`,
    details: { eventId },
  });

  const { data: leads } = await supabase
    .from("fieldops_team_member")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("role", "team_lead")
    .eq("status", "active");
  await notifyFieldOps(
    supabase,
    (leads ?? [])
      .map((l) => l.user_id)
      .filter((id): id is string => Boolean(id)),
    {
      type: "fieldops_submission_received",
      title: `Event: ${input.event.title}`,
      body: "A member onboarded an event. It pays once the event has run.",
      route: `/field/lead/review/${row.id}`,
    },
  );
  logger.info(`fieldOps event onboarding submitted: ${eventId}`);

  const { data: fresh } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", row.id)
    .maybeSingle();
  return {
    status: 200,
    message:
      "Submitted. Your commission is confirmed after the event has taken place.",
    data: mapOnboarding((fresh ?? row) as unknown as OnboardingRow),
  };
}
