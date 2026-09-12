import type {
  AdminContext,
  AdminPermissionKey,
} from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  setCampaignStatusCore,
  upsertCampaignCore,
} from "../admin/fieldOps/campaignsAdminCore";
import { upsertTerritoryCore } from "../admin/fieldOps/regionsAdminCore";
import {
  publishCommissionRuleVersionCore,
  setCommissionRuleActiveCore,
} from "../admin/fieldOps/rulesAdminCore";
import { updateFieldOpsSettingsCore } from "../admin/fieldOps/settingsAdminCore";
import { addTeamMemberCore } from "../admin/fieldOps/teamAdminCore";
import { createAssignmentCore } from "../fieldOps/lead/leadAssignmentsCore";
import { reviewOnboardingCore } from "../fieldOps/lead/reviewCore";
import { submitClaimAssistCore } from "../fieldOps/member/claimAssistCore";
import { submitEventOnboardingCore } from "../fieldOps/member/eventOnboardingCore";
import { startOnboardingCore } from "../fieldOps/member/onboardingCore";
import {
  requestOwnerOtpCore,
  verifyOwnerOtpCore,
} from "../fieldOps/member/ownerOtpCore";
import { todayIso } from "../fieldOps/shared/fieldOpsRows";
import { postPlaceCore } from "../places/postPlaceCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Field Ops Phase 5: events and claim assistance.
//
//   * an event is created under the ORGANISER through the ordinary
//     create_event path, and pays nothing until it has actually run
//   * an event that is cancelled or moderated away before its date is
//     rejected, not paid
//   * claim assistance files a real place_claim_request for the OTP-verified
//     owner and pays only once an admin approves it
//   * a rejected claim rejects the onboarding
//   * a member can never claim their own listing, or one the owner already
//     holds, and two members cannot file the same claim
//   * someone else claiming a listing the team onboarded flags it

const svc = getServiceClient() as ServiceRoleClient;

const adminCtx = (
  userId: string,
  extra: AdminPermissionKey[] = [],
): AdminContext => ({
  userId,
  email: null,
  roles: ["field_ops_manager"],
  permissions: [
    "fieldops.view",
    "fieldops.manage",
    "fieldops.rules",
    "fieldops.verify",
    "fieldops.commissions.approve",
    ...extra,
  ],
  reauthenticatedAt: Date.now(),
});

let admin: TestUser;
let admin2: TestUser;
let lead: TestUser;
let member: TestUser;
let outsider: TestUser;
let regionId: string;
let campaignId: string;
let territoryId: string;
let memberId: string;
let categoryId: number;
let eventRuleId: string;
let claimRuleId: string;
const ownerIds: string[] = [];
const ownerPhones: string[] = [];
const placeIds: string[] = [];
const eventIds: string[] = [];

const today = todayIso();
const uniq = String(Date.now()).slice(-8);

const fakeSend = async () => ({
  ok: true as const,
  requestId: `req-${Date.now()}`,
  prefix: "ABCD",
});
const fakeVerify = async (_r: string, _p: string, code: string) =>
  code === "1234"
    ? { ok: true as const }
    : { ok: false as const, message: "Wrong code" };

const patchSettings = async (
  patch: Parameters<typeof updateFieldOpsSettingsCore>[2]["patch"],
  reason: string,
) => {
  const { data: current } = await svc
    .from("fieldops_program_setting")
    .select("updated_at")
    .eq("id", 1)
    .single();
  const res = await updateFieldOpsSettingsCore(svc, adminCtx(admin.id), {
    patch,
    expectedUpdatedAt: current?.updated_at as string,
    reason,
  });
  if (res.status !== 200 && res.message !== "Nothing changed.") {
    throw new Error(`settings patch failed: ${res.message}`);
  }
};

const sweep = async () => {
  const { data, error } = await svc.rpc("fieldops_run_eligibility_sweep", {
    p_limit: 100,
  });
  expect(error, error?.message).toBeNull();
  return data as Record<string, number | boolean>;
};

const onboardingOf = async (id: string) => {
  const { data } = await svc
    .from("fieldops_onboarding")
    .select(
      "status, flags, activity_key, event_id, claim_request_id, holding_until",
    )
    .eq("id", id)
    .single();
  return data as {
    status: string;
    flags: string[];
    activity_key: string | null;
    event_id: string | null;
    claim_request_id: string | null;
    holding_until: string | null;
  };
};

const commissionOf = async (onboardingId: string) => {
  const { data } = await svc
    .from("fieldops_commission")
    .select("id, status, amount_minor, activity_key")
    .eq("onboarding_id", onboardingId)
    .is("reverses_commission_id", null)
    .maybeSingle();
  return data;
};

const makeDue = (id: string) =>
  svc
    .from("fieldops_onboarding")
    .update({
      holding_until: new Date(Date.now() - 60_000).toISOString(),
    } as never)
    .eq("id", id);

/** An owner account with a confirmed phone, ready to be OTP-verified. */
async function newOwner(): Promise<{ id: string; phone: string }> {
  const phone = `+2335${uniq}${ownerPhones.length}`;
  const { data } = await svc.auth.admin.createUser({
    phone,
    phone_confirm: true,
  });
  const id = data.user?.id as string;
  ownerIds.push(id);
  ownerPhones.push(phone);
  return { id, phone };
}

async function verifyOwner(onboardingId: string, phone: string) {
  const sent = await requestOwnerOtpCore(
    svc,
    member.id,
    {
      campaignId,
      onboardingId,
      ownerFullName: "Kwame Owner",
      ownerPhoneE164: phone,
    },
    { sendOtp: fakeSend },
  );
  expect(sent.status, sent.message).toBe(200);
  const ok = await verifyOwnerOtpCore(
    svc,
    member.id,
    { campaignId, onboardingId, code: "1234" },
    { verifyOtp: fakeVerify },
  );
  expect(ok.status, ok.message).toBe(200);
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  [admin, admin2, lead, member, outsider] = await Promise.all([
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
  ]);
  const { data: cat } = await svc
    .from("place_category")
    .select("id")
    .limit(1)
    .single();
  categoryId = Number(cat?.id);

  await patchSettings(
    {
      programEnabled: true,
      commissionGenerationEnabled: true,
      requireMemberPhoneVerified: false,
      spotCheckBps: 0,
      dailySubmissionCap: 50,
    },
    "integration test",
  );

  const ctx = adminCtx(admin.id);
  const { data: region } = await svc
    .from("fieldops_region")
    .insert({ name: `FieldOps p5 ${uniq}`, country_code: "GH" } as never)
    .select("id")
    .single();
  regionId = region?.id as string;
  const created = await upsertCampaignCore(svc, ctx, {
    regionId,
    name: "Events and claims",
    currency: "GHS",
  });
  campaignId = created.data?.id as string;
  const t = await upsertTerritoryCore(svc, ctx, {
    regionId,
    name: "Ejisu",
    kind: "town",
    centre: { lat: 6.7208, lng: -1.3661 },
    radiusM: 4000,
  });
  territoryId = t.data?.id as string;

  await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "team_lead",
    userId: lead.id,
  });
  const m = await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "offline_member",
    userId: member.id,
  });
  memberId = m.data?.id as string;

  // Campaign-scoped rules so the programme defaults stay inactive and no
  // other suite starts minting commissions.
  const ev = await publishCommissionRuleVersionCore(svc, ctx, {
    campaignId,
    activityKey: "event_onboarding_offline",
    amountMinor: 500,
    currency: "GHS",
    eligibility: {
      require_owner_phone_verified: true,
      require_inside_territory: true,
      min_description_chars: 80,
      release_policy: "event_started" as const,
    },
    note: "Integration test event rule.",
    reason: "integration test",
  });
  expect(ev.status, ev.message).toBe(200);
  eventRuleId = ev.data?.id as string;
  const evLive = await setCommissionRuleActiveCore(svc, adminCtx(admin2.id), {
    campaignId,
    activityKey: "event_onboarding_offline",
    ruleId: eventRuleId,
    reason: "integration test",
  });
  expect(evLive.status, evLive.message).toBe(200);

  const cl = await publishCommissionRuleVersionCore(svc, ctx, {
    campaignId,
    activityKey: "existing_place_claim_assist",
    amountMinor: 200,
    currency: "GHS",
    eligibility: {
      require_owner_phone_verified: true,
      release_policy: "claim_approved" as const,
    },
    note: "Integration test claim rule.",
    reason: "integration test",
  });
  expect(cl.status, cl.message).toBe(200);
  claimRuleId = cl.data?.id as string;
  const clLive = await setCommissionRuleActiveCore(svc, adminCtx(admin2.id), {
    campaignId,
    activityKey: "existing_place_claim_assist",
    ruleId: claimRuleId,
    reason: "integration test",
  });
  expect(clLive.status, clLive.message).toBe(200);

  const active = await setCampaignStatusCore(svc, ctx, {
    campaignId,
    action: "activate",
    reason: "t",
  });
  expect(active.status, active.message).toBe(200);
  const a = await createAssignmentCore(svc, lead.id, {
    campaignId,
    memberId,
    territoryId,
    startsOn: today,
    endsOn: today,
  });
  expect(a.status, a.message).toBe(200);
});

afterAll(async () => {
  await svc.from("fieldops_assignment").delete().eq("campaign_id", campaignId);
  await patchSettings(
    {
      programEnabled: false,
      requireMemberPhoneVerified: true,
      spotCheckBps: 500,
      dailySubmissionCap: 8,
    },
    "cleanup",
  ).catch(() => undefined);
  await svc.from("phone_otp_state").delete().in("phone_e164", ownerPhones);
  for (const id of ownerIds) await svc.auth.admin.deleteUser(id);
  await Promise.all(
    [admin, admin2, lead, member, outsider].map((u) =>
      deleteTestUser(svc, u.id),
    ),
  );
});

const eventInput = (title: string, startsInDays: number) => ({
  title,
  description:
    "An all-night highlife concert at the Ejisu community grounds with live bands, food stalls and parking on site.",
  category: "concert",
  types: ["Live Concerts"],
  address: "Ejisu community grounds, Ejisu",
  location: { lat: 6.7215, lng: -1.3655 },
  startsAt: new Date(Date.now() + startsInDays * 86_400_000).toISOString(),
  endsAt: new Date(
    Date.now() + startsInDays * 86_400_000 + 4 * 3_600_000,
  ).toISOString(),
  capacity: 500,
  websiteUrl: null,
  requireRegistration: false,
  freeEvent: true,
  singleTicket: null,
  flyer: { publicId: `event_flyers/${""}/flyer`, version: "1" },
});

async function onboardEvent(
  title: string,
  startsInDays: number,
): Promise<{ onboardingId: string; eventId: string; ownerId: string }> {
  const start = await startOnboardingCore(svc, member.id, {
    campaignId,
    territoryId,
    kind: "event",
  });
  expect(start.status, start.message).toBe(200);
  const onboardingId = start.data?.id as string;
  const owner = await newOwner();
  await verifyOwner(onboardingId, owner.phone);

  const submitted = await submitEventOnboardingCore(svc, member.id, {
    campaignId,
    onboardingId,
    event: {
      ...eventInput(title, startsInDays),
      flyer: { publicId: `event_flyers/${member.id}/flyer`, version: "1" },
    },
    submissionLocation: { lat: 6.7216, lng: -1.3656 },
    submissionAccuracyM: 12,
  });
  expect(submitted.status, submitted.message).toBe(200);
  const eventId = submitted.data?.eventId as string;
  eventIds.push(eventId);

  const reviewed = await reviewOnboardingCore(svc, lead.id, {
    campaignId,
    onboardingId,
    decision: "verified",
  });
  expect(reviewed.status, reviewed.message).toBe(200);
  return { onboardingId, eventId, ownerId: owner.id };
}

describe("onboarding an event", () => {
  it("creates the event under the organiser, not the member", async () => {
    const { onboardingId, eventId, ownerId } = await onboardEvent(
      "Ejisu Highlife Night",
      10,
    );
    const { data: ev } = await svc
      .from("event")
      .select("organizer_id, status, client_request_id, title")
      .eq("id", eventId)
      .single();
    expect(ev?.organizer_id).toBe(ownerId);
    expect(ev?.organizer_id).not.toBe(member.id);
    expect(ev?.status).toBe("published");

    const row = await onboardingOf(onboardingId);
    expect(row.activity_key).toBe("event_onboarding_offline");
    expect(row.event_id).toBe(eventId);
    // The event carries this onboarding's request id, so the sweep can
    // prove the team really created it.
    const { data: ob } = await svc
      .from("fieldops_onboarding")
      .select("client_request_id")
      .eq("id", onboardingId)
      .single();
    expect(ev?.client_request_id).toBe(ob?.client_request_id);
  });

  it("refuses a flyer uploaded from another account", async () => {
    const start = await startOnboardingCore(svc, member.id, {
      campaignId,
      territoryId,
      kind: "event",
    });
    const onboardingId = start.data?.id as string;
    const owner = await newOwner();
    await verifyOwner(onboardingId, owner.phone);
    const res = await submitEventOnboardingCore(svc, member.id, {
      campaignId,
      onboardingId,
      event: {
        ...eventInput("Borrowed Flyer Party", 10),
        flyer: { publicId: `event_flyers/${outsider.id}/flyer`, version: "1" },
      },
      submissionLocation: { lat: 6.7216, lng: -1.3656 },
    });
    expect(res.status).toBe(403);
  });

  it("refuses an event that starts in the past", async () => {
    const start = await startOnboardingCore(svc, member.id, {
      campaignId,
      territoryId,
      kind: "event",
    });
    const onboardingId = start.data?.id as string;
    const owner = await newOwner();
    await verifyOwner(onboardingId, owner.phone);
    const res = await submitEventOnboardingCore(svc, member.id, {
      campaignId,
      onboardingId,
      event: {
        ...eventInput("Yesterday's Party", -2),
        flyer: { publicId: `event_flyers/${member.id}/flyer`, version: "1" },
      },
      submissionLocation: { lat: 6.7216, lng: -1.3656 },
    });
    expect(res.status).toBe(400);
  });
});

describe("an event pays only once it has happened", () => {
  it("waits while the event is still in the future", async () => {
    const { onboardingId } = await onboardEvent("Future Festival", 30);
    await makeDue(onboardingId);
    const result = await sweep();
    expect(Number(result.waiting)).toBeGreaterThanOrEqual(1);
    // Still verified, with no flag: waiting is not a problem.
    const row = await onboardingOf(onboardingId);
    expect(row.status).toBe("verified");
    expect(row.flags).not.toContain("awaiting_release_policy");
    expect((await commissionOf(onboardingId))?.status).toBe("pending");
  });

  it("pays once the event has started", async () => {
    const { onboardingId, eventId } = await onboardEvent("Last Night Jam", 10);
    // The event happened yesterday.
    await svc
      .from("event")
      .update({
        starts_at: new Date(Date.now() - 86_400_000).toISOString(),
        ends_at: new Date(Date.now() - 80_000_000).toISOString(),
      } as never)
      .eq("id", eventId);
    await makeDue(onboardingId);
    await sweep();

    expect((await onboardingOf(onboardingId)).status).toBe("succeeded");
    const c = await commissionOf(onboardingId);
    expect(c?.status).toBe("approved");
    expect(Number(c?.amount_minor)).toBe(500);
    expect(c?.activity_key).toBe("event_onboarding_offline");
  });

  it("rejects an event that was cancelled before its date", async () => {
    const { onboardingId, eventId } = await onboardEvent("Called Off Gig", 10);
    // NB: the event table spells it "canceled" (one l), unlike every other
    // status column in the schema.
    const { error: cancelErr } = await svc
      .from("event")
      .update({
        starts_at: new Date(Date.now() - 86_400_000).toISOString(),
        status: "canceled",
      } as never)
      .eq("id", eventId);
    expect(cancelErr, cancelErr?.message).toBeNull();
    await makeDue(onboardingId);
    await sweep();

    const row = await onboardingOf(onboardingId);
    expect(row.status).toBe("rejected");
    expect(row.flags).toContain("event_published");
    expect((await commissionOf(onboardingId))?.status).toBe("rejected");
  });

  it("rejects an event that was moderated away", async () => {
    const { onboardingId, eventId } = await onboardEvent("Hidden Gig", 10);
    await svc
      .from("event")
      .update({
        starts_at: new Date(Date.now() - 86_400_000).toISOString(),
        moderation_state: "hidden",
      } as never)
      .eq("id", eventId);
    await makeDue(onboardingId);
    await sweep();

    const row = await onboardingOf(onboardingId);
    expect(row.status).toBe("rejected");
    expect(row.flags).toContain("event_not_moderated");
  });
});

/** A listing that is already on Abonten, owned by someone else. */
async function existingPlace(name: string, ownerId: string): Promise<string> {
  const created = await postPlaceCore(svc, ownerId, {
    name,
    categoryId,
    description:
      "A long-standing provisions shop on the Ejisu road, open every day from early morning until late evening.",
    address: "Ejisu road, Ejisu",
    latitude: 6.723,
    longitude: -1.367,
    coverPublicId: `place_photos/${ownerId}/cover`,
    coverVersion: "1",
    openingHours: [],
    clientRequestId: crypto.randomUUID(),
  });
  expect(created.status, created.message).toBe(200);
  const id = (created as { placeId: string }).placeId;
  placeIds.push(id);
  return id;
}

async function startClaimAssist(): Promise<{
  onboardingId: string;
  owner: { id: string; phone: string };
}> {
  const start = await startOnboardingCore(svc, member.id, {
    campaignId,
    territoryId,
  });
  expect(start.status, start.message).toBe(200);
  const onboardingId = start.data?.id as string;
  const owner = await newOwner();
  await verifyOwner(onboardingId, owner.phone);
  return { onboardingId, owner };
}

describe("claim assistance", () => {
  let claimOnboardingId: string;
  let claimPlaceId: string;

  it("files a real claim for the verified owner, not for the member", async () => {
    // The listing was put up by a stranger and never claimed.
    claimPlaceId = await existingPlace("Mama Efua Provisions", outsider.id);
    const { onboardingId, owner } = await startClaimAssist();
    claimOnboardingId = onboardingId;

    const res = await submitClaimAssistCore(svc, member.id, {
      campaignId,
      onboardingId,
      placeId: claimPlaceId,
      note: "The owner was at the shop and confirmed it is hers.",
    });
    expect(res.status, res.message).toBe(200);

    const row = await onboardingOf(onboardingId);
    expect(row.status).toBe("submitted");
    expect(row.activity_key).toBe("existing_place_claim_assist");
    expect(row.claim_request_id).toBeTruthy();

    const { data: claim } = await svc
      .from("place_claim_request")
      .select("claimant_id, place_id, status")
      .eq("id", row.claim_request_id as string)
      .single();
    // Filed FOR the owner: the member never becomes the claimant.
    expect(claim?.claimant_id).toBe(owner.id);
    expect(claim?.claimant_id).not.toBe(member.id);
    expect(claim?.status).toBe("pending");
  });

  it("refuses a second claim on the same listing", async () => {
    const { onboardingId } = await startClaimAssist();
    const res = await submitClaimAssistCore(svc, member.id, {
      campaignId,
      onboardingId,
      placeId: claimPlaceId,
    });
    expect(res.status).toBe(409);
  });

  it("refuses a claim on the member's own listing", async () => {
    const mine = await existingPlace("My Own Shop", member.id);
    const { onboardingId } = await startClaimAssist();
    const res = await submitClaimAssistCore(svc, member.id, {
      campaignId,
      onboardingId,
      placeId: mine,
    });
    expect(res.status).toBe(403);
  });

  it("refuses a claim when the owner already holds the listing", async () => {
    const { onboardingId, owner } = await startClaimAssist();
    const theirs = await existingPlace("Already Theirs", owner.id);
    const res = await submitClaimAssistCore(svc, member.id, {
      campaignId,
      onboardingId,
      placeId: theirs,
    });
    expect(res.status).toBe(409);
  });
});

describe("a claim assist pays when the claim is approved", () => {
  async function claimReadyForSweep(name: string) {
    const placeId = await existingPlace(name, outsider.id);
    const { onboardingId, owner } = await startClaimAssist();
    const filed = await submitClaimAssistCore(svc, member.id, {
      campaignId,
      onboardingId,
      placeId,
    });
    expect(filed.status, filed.message).toBe(200);
    const reviewed = await reviewOnboardingCore(svc, lead.id, {
      campaignId,
      onboardingId,
      decision: "verified",
    });
    expect(reviewed.status, reviewed.message).toBe(200);
    const { claim_request_id: claimId } = await onboardingOf(onboardingId);
    return { onboardingId, placeId, owner, claimId: claimId as string };
  }

  it("waits while the claim is still pending", async () => {
    const { onboardingId } = await claimReadyForSweep("Waiting Wares");
    await makeDue(onboardingId);
    const result = await sweep();
    expect(Number(result.waiting)).toBeGreaterThanOrEqual(1);
    expect((await onboardingOf(onboardingId)).status).toBe("verified");
    expect((await commissionOf(onboardingId))?.status).toBe("pending");
  });

  it("pays once an admin approves the claim", async () => {
    const { onboardingId, claimId, owner, placeId } = await claimReadyForSweep(
      "Approved Provisions",
    );

    // The real approval path: it is the only thing that moves owner_id, and
    // it re-checks is_admin itself, so the test admin needs the flag.
    await svc
      .from("user_info")
      .update({ is_admin: true } as never)
      .eq("id", admin.id);
    const { error } = await svc.rpc("approve_place_claim", {
      p_request_id: claimId,
      p_admin_id: admin.id,
    });
    expect(error, error?.message).toBeNull();
    await svc
      .from("user_info")
      .update({ is_admin: false } as never)
      .eq("id", admin.id);

    const { data: place } = await svc
      .from("place")
      .select("owner_id, claimed")
      .eq("id", placeId)
      .single();
    expect(place?.owner_id).toBe(owner.id);

    await makeDue(onboardingId);
    await sweep();

    expect((await onboardingOf(onboardingId)).status).toBe("succeeded");
    const c = await commissionOf(onboardingId);
    expect(c?.status).toBe("approved");
    // Claim help is worth less than a full onboarding.
    expect(Number(c?.amount_minor)).toBe(200);
    expect(c?.activity_key).toBe("existing_place_claim_assist");
  });

  it("rejects the onboarding when the claim is rejected", async () => {
    const { onboardingId, claimId } = await claimReadyForSweep("Refused Store");
    await svc
      .from("place_claim_request")
      .update({
        status: "rejected",
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
      } as never)
      .eq("id", claimId);

    await makeDue(onboardingId);
    await sweep();

    const row = await onboardingOf(onboardingId);
    expect(row.status).toBe("rejected");
    expect(row.flags).toContain("claim_approved");
    expect((await commissionOf(onboardingId))?.status).toBe("rejected");
  });
});

describe("someone disputing a listing the team onboarded", () => {
  it("flags the onboarding for a human to look at", async () => {
    const { onboardingId, eventId: _e } = await onboardEvent(
      "Disputed Event",
      20,
    );
    // Give this onboarding a place to dispute, as a place onboarding would
    // have, then file a claim from an unrelated person.
    const placeId = await existingPlace("Disputed Shop", outsider.id);
    await svc
      .from("fieldops_onboarding")
      .update({ place_id: placeId, kind: "place", event_id: null } as never)
      .eq("id", onboardingId);

    const stranger = await newOwner();
    const { error } = await svc.from("place_claim_request").insert({
      place_id: placeId,
      claimant_id: stranger.id,
      note: "I am the real owner",
    } as never);
    expect(error, error?.message).toBeNull();

    const row = await onboardingOf(onboardingId);
    expect(row.flags).toContain("ownership_disputed");
  });
});
