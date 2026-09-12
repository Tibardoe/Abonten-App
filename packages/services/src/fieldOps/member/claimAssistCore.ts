import { logger } from "@abonten/core/logger";
import type { FieldOpsOnboarding } from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import {
  type FieldOpsEnvelope,
  dbErr,
  notifyFieldOps,
} from "../shared/fieldOpsRows";
import {
  ONBOARDING_COLUMNS,
  type OnboardingRow,
  appendTimeline,
  mapOnboarding,
} from "../shared/onboardingRows";

// Claim assistance: the business is already on Abonten, but the listing is
// unclaimed (or claimed by the wrong person). Rather than creating a second
// listing -- which is exactly the duplicate the programme is built to
// prevent -- the member gets the real owner verified by OTP and files the
// claim on their behalf. The commission is earned only when an admin
// approves that claim through the existing Claims module, and is worth less
// than a full onboarding because less work was done.
//
// The claim is filed with `claimant_id = owner_user_id`, so the existing
// approve_place_claim RPC is still the only thing that ever moves
// place.owner_id.

const SUBMITTING = new Set(["active", "winding_down"]);

export async function submitClaimAssistCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    campaignId: string;
    onboardingId: string;
    placeId: string;
    note?: string | null;
    submissionLocation?: { lat: number; lng: number } | null;
    submissionAccuracyM?: number | null;
  },
): Promise<FieldOpsEnvelope<FieldOpsOnboarding>> {
  let teamId: string;
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId, [
      "offline_member",
      "online_member",
    ]);
    teamId = m.teamId;
    campaignStatus = m.campaignStatus;
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
  if (row.status !== "draft" && row.status !== "needs_changes") {
    return { status: 409, message: "This onboarding has already been sent." };
  }
  if (!row.owner_user_id) {
    return {
      status: 409,
      message:
        "The owner has to verify their phone before you can file the claim.",
    };
  }

  const { data: place } = await supabase
    .from("place")
    .select("id, name, slug, owner_id, status, claimed")
    .eq("id", input.placeId)
    .maybeSingle();
  if (!place || place.status !== "published") {
    return { status: 404, message: "That listing isn't available to claim." };
  }
  // Nothing to assist with if the owner already holds it.
  if (place.owner_id === row.owner_user_id) {
    return {
      status: 409,
      message:
        "This owner already holds that listing, so there is nothing to claim.",
    };
  }
  // The member must never end up owning what they onboarded.
  if (place.owner_id === userId) {
    return {
      status: 403,
      message: "You can't file a claim against your own listing.",
    };
  }

  // One live claim per place: the existing partial unique index on
  // place_claim_request enforces it, so a second member filing the same
  // claim gets a clean 409 rather than a duplicate for an admin to sort out.
  let claimId = row.claim_request_id ?? null;
  if (!claimId) {
    const { data: claim, error: claimErr } = await supabase
      .from("place_claim_request")
      .insert({
        place_id: input.placeId,
        claimant_id: row.owner_user_id,
        contact_phone: row.owner_phone_e164,
        note: `Filed with Field Ops help by ${row.member_user_id}. Onboarding ${row.id}.${
          input.note ? ` ${input.note}` : ""
        }`,
      } as never)
      .select("id")
      .single();
    if (claimErr) {
      if (claimErr.code === "23505") {
        return {
          status: 409,
          message:
            "Someone has already filed a claim on this listing. It is waiting for an admin.",
        };
      }
      return dbErr(claimErr, "Could not file the claim");
    }
    claimId = claim?.id as string;
  }

  const { error: updErr } = await supabase
    .from("fieldops_onboarding")
    .update({
      activity_key: "existing_place_claim_assist",
      place_id: input.placeId,
      claim_request_id: claimId,
      business_name: row.business_name ?? place.name,
      entity_created_at: row.entity_created_at ?? new Date().toISOString(),
      submission_location: null,
      submission_accuracy_m:
        input.submissionAccuracyM === null ||
        input.submissionAccuracyM === undefined
          ? null
          : Math.round(input.submissionAccuracyM),
      // A listing the team did not place has no pin of ours to measure.
      submission_distance_m: null,
      inside_territory: null,
      duplicate_acknowledged: true,
    } as never)
    .eq("id", row.id);
  if (updErr) {
    if (updErr.code === "23505") {
      return {
        status: 409,
        message: "This listing is already part of another onboarding.",
      };
    }
    return dbErr(updErr, "Could not save the claim");
  }

  const { error: trErr } = await supabase.rpc(
    "fieldops_transition_onboarding",
    {
      p_onboarding_id: row.id,
      p_to: "submitted",
      p_actor: userId,
      p_actor_kind: "member",
      p_note: "Claim assistance",
      p_details: { claim_request_id: claimId, place_id: input.placeId },
    },
  );
  if (trErr) return dbErr(trErr, "Could not submit");

  await appendTimeline(supabase, {
    onboardingId: row.id,
    status: "submitted",
    actorUserId: userId,
    actorKind: "member",
    note: `Claim filed for ${place.name}`,
    details: { claimRequestId: claimId },
  });

  // The lead reviews it like any other submission; the money still waits
  // for an admin to approve the claim itself.
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
      title: `Claim help: ${place.name}`,
      body: "A member helped an owner claim a listing that was already on Abonten.",
      route: `/field/lead/review/${row.id}`,
    },
  );
  logger.info(`fieldOps claim assist filed for place ${input.placeId}`);

  const { data: fresh } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", row.id)
    .maybeSingle();
  return {
    status: 200,
    message:
      "Claim filed. You'll be paid once an admin approves it for the owner.",
    data: mapOnboarding((fresh ?? row) as unknown as OnboardingRow),
  };
}
