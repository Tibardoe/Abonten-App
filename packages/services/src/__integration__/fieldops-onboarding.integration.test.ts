import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  setCampaignStatusCore,
  upsertCampaignCore,
} from "../admin/fieldOps/campaignsAdminCore";
import { decideOnboardingAdminCore } from "../admin/fieldOps/onboardingsAdminCore";
import { upsertTerritoryCore } from "../admin/fieldOps/regionsAdminCore";
import { updateFieldOpsSettingsCore } from "../admin/fieldOps/settingsAdminCore";
import { addTeamMemberCore } from "../admin/fieldOps/teamAdminCore";
import { createAssignmentCore } from "../fieldOps/lead/leadAssignmentsCore";
import {
  listReviewQueueCore,
  reviewOnboardingCore,
} from "../fieldOps/lead/reviewCore";
import { requestEvidenceUploadCore } from "../fieldOps/member/evidenceCore";
import {
  getOnboardingDetailCore,
  getOnboardingDraftCore,
  searchSimilarPlacesCore,
  startOnboardingCore,
  submitOnboardingCore,
  withdrawOnboardingCore,
} from "../fieldOps/member/onboardingCore";
import {
  attachOwnerCore,
  readConsentToken,
  requestOwnerOtpCore,
  signConsentToken,
  verifyOwnerOtpCore,
} from "../fieldOps/member/ownerOtpCore";
import { createProspectCore } from "../fieldOps/member/prospectsCore";
import { todayIso } from "../fieldOps/shared/fieldOpsRows";
import {
  ONBOARDING_COLUMNS,
  type OnboardingRow,
} from "../fieldOps/shared/onboardingRows";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Field Ops Phase 2: the onboarding record.
//
//   * a draft opens only in a territory the member is assigned to, and
//     resumes on the same clientRequestId
//   * the owner is proven by OTP: never the member, never a team member's
//     phone; the account is created/found and pinned to the onboarding
//   * submission creates a real place owned by the OWNER (client_request_id
//     = the onboarding's), needs the owner first, records distance and
//     territory containment, snapshots similar listings
//   * the same place can't be onboarded twice; the same owner can't have
//     two live onboardings in a campaign
//   * the member can't review their own; the lead's decision snapshots the
//     rule + holding period; needs_changes → resubmit; an admin can decide
//   * RLS: member sees own rows (owner phone column unreadable), lead sees
//     the team's, nobody writes; the timeline is append-only

const svc = getServiceClient() as ServiceRoleClient;

const adminCtx = (userId: string): AdminContext => ({
  userId,
  email: null,
  roles: ["field_ops_manager"],
  permissions: ["fieldops.view", "fieldops.manage", "fieldops.verify"],
  reauthenticatedAt: Date.now(),
});

let admin: TestUser;
let lead: TestUser;
let member: TestUser;
let other: TestUser;
let ownerA: { id: string; phone: string };
let regionId: string;
let campaignId: string;
let territoryId: string;
let memberId: string;
let otherMemberId: string;
let settingsUpdatedAt: string;
let categoryId: number;
const placeIds: string[] = [];

const today = todayIso();
const uniq = String(Date.now()).slice(-8);
const phoneA = `+2335${uniq}`;
const phoneMember = `+2336${uniq}`;

// A fake Hubtel: every send succeeds, code "1234" verifies.
const fakeSend = async () => ({
  ok: true as const,
  requestId: `req-${Date.now()}`,
  prefix: "ABCD",
});
const fakeVerify = async (_r: string, _p: string, code: string) =>
  code === "1234"
    ? { ok: true as const }
    : { ok: false as const, message: "Wrong code" };

const placeInput = (name: string, phone?: string) => ({
  name,
  categoryId,
  description:
    "A busy chop bar by the lorry station serving jollof, banku and tilapia every day from morning till late.",
  address: "Ejisu lorry station, Ejisu",
  location: { lat: 6.7215, lng: -1.3655 },
  phoneE164: phone ?? null,
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    dayOfWeek: d,
    openTime: "08:00",
    closeTime: "20:00",
    isClosed: false,
  })),
  cover: { publicId: "", version: "1" },
  photos: [] as { publicId: string; version: string }[],
});

async function rowOf(id: string): Promise<OnboardingRow> {
  const { data } = await svc
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", id)
    .single();
  return data as unknown as OnboardingRow;
}

async function addEvidence(
  userId: string,
  onboardingId: string,
  kind: "storefront" | "interior",
) {
  const t = await requestEvidenceUploadCore(svc, userId, {
    campaignId,
    onboardingId,
    kind,
    mimeType: "image/jpeg",
    sizeBytes: 1234,
    location: { lat: 6.7215, lng: -1.3655 },
    accuracyM: 10,
  });
  expect(t.status, t.message).toBe(200);
  const { error } = await svc.storage
    .from(t.data?.bucket as string)
    .upload(t.data?.path as string, Buffer.from("not-really-a-jpeg"), {
      contentType: "image/jpeg",
    });
  expect(error).toBeNull();
}

beforeAll(async () => {
  // The OTP store, the rate limiter and the consent-token signer reach the
  // database through getSupabaseServiceClient() (same precedent as the
  // credits-redemption suite): point it at the local stack.
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  [admin, lead, member, other] = await Promise.all([
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
  ]);
  const { data: memberAuth } = await svc.auth.admin.updateUserById(member.id, {
    phone: phoneMember,
    phone_confirm: true,
  });
  expect(memberAuth.user?.phone).toBeTruthy();
  const { data: cat } = await svc
    .from("place_category")
    .select("id")
    .limit(1)
    .single();
  categoryId = Number(cat?.id);

  const ctx = adminCtx(admin.id);
  const { data: settings } = await svc
    .from("fieldops_program_setting")
    .select("updated_at")
    .eq("id", 1)
    .single();
  const updated = await updateFieldOpsSettingsCore(svc, ctx, {
    patch: { programEnabled: true, requireMemberPhoneVerified: false },
    expectedUpdatedAt: settings?.updated_at as string,
    reason: "integration test",
  });
  expect(updated.status, updated.message).toBe(200);
  settingsUpdatedAt = updated.data?.updatedAt as string;

  const { data: region } = await svc
    .from("fieldops_region")
    .insert({
      name: `FieldOps onboarding ${uniq}`,
      country_code: "GH",
    } as never)
    .select("id")
    .single();
  regionId = region?.id as string;
  const created = await upsertCampaignCore(svc, ctx, {
    regionId,
    name: "Onboarding campaign",
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
  const o = await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "online_member",
    userId: other.id,
  });
  otherMemberId = o.data?.id as string;
  const active = await setCampaignStatusCore(svc, ctx, {
    campaignId,
    action: "activate",
    reason: "t",
  });
  expect(active.status, active.message).toBe(200);
  for (const id of [memberId, otherMemberId]) {
    const a = await createAssignmentCore(svc, lead.id, {
      campaignId,
      memberId: id,
      territoryId,
      startsOn: today,
      endsOn: today,
    });
    expect(a.status, a.message).toBe(200);
  }
  const { data: ownerUser } = await svc.auth.admin.createUser({
    phone: phoneA,
    phone_confirm: true,
  });
  ownerA = { id: ownerUser.user?.id as string, phone: phoneA };
});

afterAll(async () => {
  await svc.from("fieldops_onboarding").delete().eq("campaign_id", campaignId);
  await svc.from("fieldops_prospect").delete().eq("campaign_id", campaignId);
  await svc.from("fieldops_assignment").delete().eq("campaign_id", campaignId);
  await svc.from("fieldops_team_member").delete().eq("campaign_id", campaignId);
  await svc.from("fieldops_team").delete().eq("campaign_id", campaignId);
  await svc.from("fieldops_campaign").delete().eq("id", campaignId);
  await svc.from("fieldops_territory").delete().eq("region_id", regionId);
  await svc.from("fieldops_region").delete().eq("id", regionId);
  if (placeIds.length > 0) await svc.from("place").delete().in("id", placeIds);
  await svc
    .from("phone_otp_state")
    .delete()
    .in("phone_e164", [phoneA, phoneMember]);
  const { data: objects } = await svc.storage
    .from("fieldops-evidence")
    .list(campaignId);
  for (const o of objects ?? []) {
    const { data: files } = await svc.storage
      .from("fieldops-evidence")
      .list(`${campaignId}/${o.name}`);
    if (files?.length) {
      await svc.storage
        .from("fieldops-evidence")
        .remove(files.map((f) => `${campaignId}/${o.name}/${f.name}`));
    }
  }
  await updateFieldOpsSettingsCore(svc, adminCtx(admin.id), {
    patch: { programEnabled: false, requireMemberPhoneVerified: true },
    expectedUpdatedAt: settingsUpdatedAt,
    reason: "cleanup",
  });
  await svc.auth.admin.deleteUser(ownerA.id);
  await Promise.all(
    [admin, lead, member, other].map((u) => deleteTestUser(svc, u.id)),
  );
});

let onboardingId: string;

describe("start + owner", () => {
  it("opens a draft in an assigned territory, resumes on the same request id, refuses elsewhere", async () => {
    const crid = crypto.randomUUID();
    const first = await startOnboardingCore(svc, member.id, {
      campaignId,
      territoryId,
      clientRequestId: crid,
    });
    expect(first.status, first.message).toBe(200);
    expect(first.data?.status).toBe("draft");
    expect(first.data?.mode).toBe("offline");
    onboardingId = first.data?.id as string;
    const again = await startOnboardingCore(svc, member.id, {
      campaignId,
      territoryId,
      clientRequestId: crid,
    });
    expect(again.data?.id).toBe(onboardingId);

    const asLead = await startOnboardingCore(svc, lead.id, {
      campaignId,
      territoryId,
    });
    expect(asLead.status).toBe(403);
    const { data: strangerTerritory } = await svc
      .from("fieldops_territory")
      .insert({
        region_id: regionId,
        name: "Nowhere",
        centre: "SRID=4326;POINT(-1.2 6.6)",
        radius_m: 1000,
      } as never)
      .select("id")
      .single();
    const noAssignment = await startOnboardingCore(svc, member.id, {
      campaignId,
      territoryId: strangerTerritory?.id as string,
    });
    expect(noAssignment.status).toBe(409);
  });

  it("refuses the member's own phone and a team member's phone as the owner; sends otherwise", async () => {
    const own = await requestOwnerOtpCore(
      svc,
      member.id,
      {
        campaignId,
        onboardingId,
        ownerFullName: "Me",
        ownerPhoneE164: phoneMember,
      },
      { sendOtp: fakeSend },
    );
    expect(own.status).toBe(400);

    const invitePhone = `+2337${uniq}`;
    await svc.from("fieldops_team_member").insert({
      team_id: (
        await svc
          .from("fieldops_team")
          .select("id")
          .eq("campaign_id", campaignId)
          .single()
      ).data?.id,
      campaign_id: campaignId,
      invited_phone_e164: invitePhone,
      role: "online_member",
      status: "invited",
    } as never);
    const teamPhone = await requestOwnerOtpCore(
      svc,
      member.id,
      {
        campaignId,
        onboardingId,
        ownerFullName: "Kofi",
        ownerPhoneE164: invitePhone,
      },
      { sendOtp: fakeSend },
    );
    expect(teamPhone.status).toBe(409);

    const sent = await requestOwnerOtpCore(
      svc,
      member.id,
      {
        campaignId,
        onboardingId,
        ownerFullName: "Auntie Ama",
        ownerPhoneE164: phoneA,
      },
      { sendOtp: fakeSend },
    );
    expect(sent.status, sent.message).toBe(200);
    expect(sent.data?.ownerPhoneMasked).toMatch(/\*/);
    expect(sent.data?.consentPath).toBeNull(); // offline member

    const tooSoon = await requestOwnerOtpCore(
      svc,
      member.id,
      {
        campaignId,
        onboardingId,
        ownerFullName: "Auntie Ama",
        ownerPhoneE164: phoneA,
      },
      { sendOtp: fakeSend },
    );
    expect(tooSoon.status).toBe(429);
  });

  it("verifies the code, finds the owner's account and pins it; a wrong code fails", async () => {
    const wrong = await verifyOwnerOtpCore(
      svc,
      member.id,
      { campaignId, onboardingId, code: "9999" },
      { verifyOtp: fakeVerify },
    );
    expect(wrong.status).toBe(401);
    const ok = await verifyOwnerOtpCore(
      svc,
      member.id,
      { campaignId, onboardingId, code: "1234" },
      { verifyOtp: fakeVerify },
    );
    expect(ok.status, ok.message).toBe(200);
    expect(ok.data?.ownerVerified).toBe(true);
    expect(ok.data?.ownerIsNewAccount).toBe(false);
    const row = await rowOf(onboardingId);
    expect(row.owner_user_id).toBe(ownerA.id);
    // Consumed: the same code can't be replayed.
    const replay = await verifyOwnerOtpCore(
      svc,
      member.id,
      { campaignId, onboardingId, code: "1234" },
      { verifyOtp: fakeVerify },
    );
    expect(replay.status).toBe(409);
  });

  it("never lets the member be the owner (attachOwnerCore + CHECK)", async () => {
    const draft = await startOnboardingCore(svc, other.id, {
      campaignId,
      territoryId,
    });
    expect(draft.status, draft.message).toBe(200);
    const row = await rowOf(draft.data?.id as string);
    const self = await attachOwnerCore(svc, row, other.id, false, other.id);
    expect(self.status).toBe(400);
    const { error } = await svc
      .from("fieldops_onboarding")
      .update({ owner_user_id: other.id } as never)
      .eq("id", row.id);
    expect(error?.code).toBe("23514");
    const asMember = await attachOwnerCore(
      svc,
      row,
      member.id,
      false,
      other.id,
    );
    expect(asMember.status).toBe(409);
    await withdrawOnboardingCore(svc, other.id, {
      campaignId,
      onboardingId: row.id,
    });
  });

  it("consent tokens round-trip and expire", () => {
    const token = signConsentToken(onboardingId, phoneA, 1_000);
    const read = readConsentToken(token, 2_000);
    expect(read?.onboardingId).toBe(onboardingId);
    expect(read?.expired).toBe(false);
    expect(readConsentToken(token, 1_000 + 31 * 60 * 1000)?.expired).toBe(true);
    expect(readConsentToken(`${token}x`)).toBeNull();
  });
});

describe("submission", () => {
  it("needs the member's position and evidence for offline work, then creates the place under the owner", async () => {
    const draft = await getOnboardingDraftCore(svc, member.id, {
      campaignId,
      onboardingId,
    });
    expect(draft.data?.onboarding.ownerVerified).toBe(true);

    const noGps = await submitOnboardingCore(svc, member.id, {
      campaignId,
      onboardingId,
      place: {
        ...placeInput("Auntie Ama's Chop Bar"),
        cover: { publicId: `place_photos/${member.id}/cover`, version: "1" },
      },
    });
    expect(noGps.status).toBe(400);

    const foreignPhoto = await submitOnboardingCore(svc, member.id, {
      campaignId,
      onboardingId,
      place: {
        ...placeInput("Auntie Ama's Chop Bar"),
        cover: { publicId: `place_photos/${other.id}/cover`, version: "1" },
      },
      submissionLocation: { lat: 6.7216, lng: -1.3656 },
    });
    expect(foreignPhoto.status).toBe(403);

    const noEvidence = await submitOnboardingCore(svc, member.id, {
      campaignId,
      onboardingId,
      place: {
        ...placeInput("Auntie Ama's Chop Bar"),
        cover: { publicId: `place_photos/${member.id}/cover`, version: "1" },
      },
      submissionLocation: { lat: 6.7216, lng: -1.3656 },
      submissionAccuracyM: 12,
    });
    expect(noEvidence.status).toBe(400);
    expect(noEvidence.message).toMatch(/storefront/);

    await addEvidence(member.id, onboardingId, "storefront");
    await addEvidence(member.id, onboardingId, "interior");

    const submitted = await submitOnboardingCore(svc, member.id, {
      campaignId,
      onboardingId,
      place: {
        ...placeInput("Auntie Ama's Chop Bar", phoneA),
        cover: { publicId: `place_photos/${member.id}/cover`, version: "1" },
        photos: [{ publicId: `place_photos/${member.id}/p1`, version: "1" }],
      },
      submissionLocation: { lat: 6.7216, lng: -1.3656 },
      submissionAccuracyM: 12,
    });
    expect(submitted.status, submitted.message).toBe(200);
    expect(submitted.data?.status).toBe("submitted");
    expect(submitted.data?.activityKey).toBe("place_onboarding_offline");
    expect(submitted.data?.insideTerritory).toBe(true);
    expect(submitted.data?.submissionDistanceM).toBeLessThan(50);
    expect(submitted.data?.placeId).toBeTruthy();
    placeIds.push(submitted.data?.placeId as string);

    const { data: place } = await svc
      .from("place")
      .select("owner_id, client_request_id, status, place_photo(count)")
      .eq("id", submitted.data?.placeId as string)
      .single();
    const row = await rowOf(onboardingId);
    expect(place?.owner_id).toBe(ownerA.id);
    expect(place?.client_request_id).toBe(row.client_request_id);
    expect(place?.status).toBe("published");

    const { data: leadNotice } = await svc
      .from("notification")
      .select("id")
      .eq("user_id", lead.id)
      .eq("type", "fieldops_submission_received");
    expect(leadNotice?.length).toBe(1);
  });

  it("finds the new place as a similar listing and refuses a second onboarding of it / of the same owner", async () => {
    const draft2 = await startOnboardingCore(svc, other.id, {
      campaignId,
      territoryId,
    });
    const id2 = draft2.data?.id as string;
    const similar = await searchSimilarPlacesCore(svc, other.id, {
      campaignId,
      onboardingId: id2,
      name: "Aunty Ama Chop Bar",
      location: { lat: 6.7214, lng: -1.3654 },
    });
    expect(similar.status, similar.message).toBe(200);
    expect(similar.data?.[0]?.id).toBe(placeIds[0]);
    expect(similar.data?.[0]?.strong).toBe(true);

    const byPhone = await searchSimilarPlacesCore(svc, other.id, {
      campaignId,
      onboardingId: id2,
      name: "Completely Different",
      location: { lat: 5.6, lng: -0.2 },
      phoneE164: phoneA,
    });
    expect(byPhone.data?.[0]?.phoneMatch).toBe(true);

    // Same owner again in this campaign: refused by the partial unique index.
    const row2 = await rowOf(id2);
    const sameOwner = await attachOwnerCore(
      svc,
      row2,
      ownerA.id,
      false,
      other.id,
    );
    expect(sameOwner.status).toBe(409);
    expect(sameOwner.message).toMatch(/already has an onboarding/);

    // Same place linked twice: refused too.
    const { error: dup } = await svc
      .from("fieldops_onboarding")
      .update({ place_id: placeIds[0] } as never)
      .eq("id", id2);
    expect(dup?.code).toBe("23505");
    await withdrawOnboardingCore(svc, other.id, {
      campaignId,
      onboardingId: id2,
    });
  });

  it("hides the owner phone from clients, shows own rows only, lead sees the team, timeline is append-only", async () => {
    const { data: mine } = await member.client
      .from("fieldops_onboarding")
      .select("id, status, business_name")
      .eq("campaign_id", campaignId);
    expect(mine?.map((r) => r.id)).toEqual([onboardingId]);
    const { error: pii } = await member.client
      .from("fieldops_onboarding")
      .select("owner_phone_e164")
      .eq("id", onboardingId);
    expect(pii?.code).toBe("42501");
    const { data: others } = await other.client
      .from("fieldops_onboarding")
      .select("id")
      .eq("id", onboardingId);
    expect(others).toEqual([]);
    const { data: leadSees } = await lead.client
      .from("fieldops_onboarding")
      .select("id")
      .eq("campaign_id", campaignId);
    expect(leadSees?.some((r) => r.id === onboardingId)).toBe(true);
    const { error: write } = await lead.client
      .from("fieldops_onboarding")
      .update({ status: "verified" } as never)
      .eq("id", onboardingId);
    expect(write?.code).toBe("42501");
    const { data: ev } = await svc
      .from("fieldops_onboarding_event")
      .select("id")
      .eq("onboarding_id", onboardingId)
      .limit(1)
      .single();
    const { error: editEvent } = await svc
      .from("fieldops_onboarding_event")
      .update({ note: "tampered" } as never)
      .eq("id", ev?.id as number);
    expect(editEvent?.code).toBe("42501");
  });
});

describe("review", () => {
  it("the member can't review their own; the lead returns it, the member resubmits, the lead verifies with a holding period", async () => {
    const queue = await listReviewQueueCore(svc, lead.id, { campaignId });
    expect(queue.data?.[0]?.id).toBe(onboardingId);
    expect(queue.data?.[0]?.ownerPhoneMasked).toMatch(/\*/);

    const self = await reviewOnboardingCore(svc, member.id, {
      campaignId,
      onboardingId,
      decision: "verified",
    });
    expect(self.status).toBe(403);

    const noNote = await reviewOnboardingCore(svc, lead.id, {
      campaignId,
      onboardingId,
      decision: "needs_changes",
    });
    expect(noNote.status).toBe(400);

    const returned = await reviewOnboardingCore(svc, lead.id, {
      campaignId,
      onboardingId,
      decision: "needs_changes",
      note: "Add the interior photo again, it's blurry",
    });
    expect(returned.status, returned.message).toBe(200);
    expect(returned.data?.status).toBe("needs_changes");

    const detail = await getOnboardingDetailCore(svc, member.id, {
      campaignId,
      onboardingId,
    });
    expect(detail.status).toBe(200);
    expect(detail.data?.timeline.map((e) => e.toStatus)).toContain(
      "needs_changes",
    );
    expect(detail.data?.place?.ownerMatches).toBe(true);
    expect(detail.data?.evidence.length).toBe(2);
    expect(detail.data?.evidence.every((e) => e.url)).toBe(true);
    expect(
      detail.data?.checks.find((c) => c.key === "owner_verified")?.ok,
    ).toBe(true);

    const resubmitted = await submitOnboardingCore(svc, member.id, {
      campaignId,
      onboardingId,
      place: {
        ...placeInput("Auntie Ama's Chop Bar", phoneA),
        cover: { publicId: `place_photos/${member.id}/cover`, version: "1" },
      },
      submissionLocation: { lat: 6.7216, lng: -1.3656 },
      submissionAccuracyM: 8,
    });
    expect(resubmitted.status, resubmitted.message).toBe(200);
    expect(resubmitted.data?.resubmissionCount).toBe(1);
    // Still the one place.
    const { count } = await svc
      .from("place")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerA.id);
    expect(count).toBe(1);

    const verified = await reviewOnboardingCore(svc, lead.id, {
      campaignId,
      onboardingId,
      decision: "verified",
    });
    expect(verified.status, verified.message).toBe(200);
    expect(verified.data?.status).toBe("verified");
    expect(verified.data?.holdingUntil).toBeTruthy();
    const row = await rowOf(onboardingId);
    expect(new Date(row.holding_until as string).getTime()).toBeGreaterThan(
      Date.now() + 6 * 86_400_000,
    );

    const twice = await reviewOnboardingCore(svc, lead.id, {
      campaignId,
      onboardingId,
      decision: "rejected",
      note: "nope",
    });
    expect(twice.status).toBe(409);

    const { data: notices } = await svc
      .from("notification")
      .select("type")
      .eq("user_id", member.id)
      .eq("type", "fieldops_submission_reviewed");
    expect(notices?.length).toBe(2);
  });

  it("an admin with fieldops.verify decides a submitted onboarding; without it, refused", async () => {
    const draft = await startOnboardingCore(svc, other.id, {
      campaignId,
      territoryId,
    });
    const id = draft.data?.id as string;
    const { data: ownerB } = await svc.auth.admin.createUser({
      phone: `+2338${uniq}`,
      phone_confirm: true,
    });
    try {
      const row = await rowOf(id);
      const attached = await attachOwnerCore(
        svc,
        row,
        ownerB.user?.id as string,
        true,
        other.id,
      );
      expect(attached.status, attached.message).toBe(200);
      const submitted = await submitOnboardingCore(svc, other.id, {
        campaignId,
        onboardingId: id,
        place: {
          ...placeInput("Kofi's Phone Repairs"),
          cover: { publicId: `place_photos/${other.id}/cover`, version: "1" },
        },
      });
      expect(submitted.status, submitted.message).toBe(200); // online: no GPS, no evidence needed
      placeIds.push(submitted.data?.placeId as string);

      const viewOnly = await decideOnboardingAdminCore(
        svc,
        { ...adminCtx(admin.id), permissions: ["fieldops.view"] },
        {
          onboardingId: id,
          decision: "rejected",
          note: "test",
          reason: "test",
        },
      );
      expect(viewOnly.status).toBe(403);
      const decided = await decideOnboardingAdminCore(svc, adminCtx(admin.id), {
        onboardingId: id,
        decision: "rejected",
        note: "Duplicate of a listing we removed",
        reason: "integration test",
      });
      expect(decided.status, decided.message).toBe(200);
      expect(decided.data?.status).toBe("rejected");
      const { data: audit } = await svc
        .from("admin_audit_log")
        .select("action")
        .eq("target_id", id)
        .eq("action", "fieldops.onboarding.rejected");
      expect(audit?.length).toBe(1);
    } finally {
      await svc.from("fieldops_onboarding").delete().eq("id", id);
      await svc.auth.admin.deleteUser(ownerB.user?.id as string);
    }
  });

  it("a prospect that became an onboarding is marked converted", async () => {
    const p = await createProspectCore(svc, other.id, {
      campaignId,
      territoryId,
      kind: "place",
      name: "Yaa's Salon",
    });
    expect(p.status, p.message).toBe(200);
    const draft = await startOnboardingCore(svc, other.id, {
      campaignId,
      territoryId,
      prospectId: p.data?.id,
    });
    expect(draft.status, draft.message).toBe(200);
    expect(draft.data?.businessName).toBe("Yaa's Salon");
    const { data: prospect } = await svc
      .from("fieldops_prospect")
      .select("onboarding_id")
      .eq("id", p.data?.id as string)
      .single();
    expect(prospect?.onboarding_id).toBe(draft.data?.id);
    await withdrawOnboardingCore(svc, other.id, {
      campaignId,
      onboardingId: draft.data?.id as string,
    });
    const { data: after } = await svc
      .from("fieldops_prospect")
      .select("onboarding_id")
      .eq("id", p.data?.id as string)
      .single();
    expect(after?.onboarding_id).toBeNull();
  });
});
