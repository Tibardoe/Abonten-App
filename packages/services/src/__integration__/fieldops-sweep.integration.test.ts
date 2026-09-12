import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  setCampaignStatusCore,
  upsertCampaignCore,
} from "../admin/fieldOps/campaignsAdminCore";
import {
  listCommissionsAdminCore,
  reverseCommissionAdminCore,
} from "../admin/fieldOps/commissionsAdminCore";
import { upsertTerritoryCore } from "../admin/fieldOps/regionsAdminCore";
import {
  decideFlagAdminCore,
  listFlagQueueAdminCore,
} from "../admin/fieldOps/reviewQueueAdminCore";
import {
  publishCommissionRuleVersionCore,
  setCommissionRuleActiveCore,
} from "../admin/fieldOps/rulesAdminCore";
import { updateFieldOpsSettingsCore } from "../admin/fieldOps/settingsAdminCore";
import { addTeamMemberCore } from "../admin/fieldOps/teamAdminCore";
import { createAssignmentCore } from "../fieldOps/lead/leadAssignmentsCore";
import { reviewOnboardingCore } from "../fieldOps/lead/reviewCore";
import { getMyEarningsCore } from "../fieldOps/member/earningsQuery";
import { requestEvidenceUploadCore } from "../fieldOps/member/evidenceCore";
import {
  startOnboardingCore,
  submitOnboardingCore,
} from "../fieldOps/member/onboardingCore";
import {
  requestOwnerOtpCore,
  verifyOwnerOtpCore,
} from "../fieldOps/member/ownerOtpCore";
import { todayIso } from "../fieldOps/shared/fieldOpsRows";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Field Ops Phase 3: the commission ledger and the eligibility sweep.
//
//   * a lead's verification records a PENDING commission at the live rule's
//     amount; the lead's decision alone never makes money payable
//   * the sweep only touches rows whose holding period has elapsed, and
//     re-runs every objective check from the records themselves
//   * pass -> succeeded + approved; a soft failure or a spot check ->
//     flagged for an admin; a hard failure (listing hidden, owner changed)
//     -> rejected, and the commission with it
//   * a budget cap leaves the money pending rather than approving over it
//   * a rule version published mid-flight never changes an earned amount
//   * running the sweep twice creates one commission, not two
//   * the ledger is immutable except its status, has no client writes and
//     no DELETE at all; reversal appends a negative offset
//   * RLS: a member reads their own commissions, a lead the team's, nobody
//     else's

const svc = getServiceClient() as ServiceRoleClient;

const adminCtx = (userId: string): AdminContext => ({
  userId,
  email: null,
  roles: ["field_ops_manager"],
  permissions: [
    "fieldops.view",
    "fieldops.manage",
    "fieldops.rules",
    "fieldops.verify",
    "fieldops.commissions.approve",
  ],
  reauthenticatedAt: Date.now(),
});

let admin: TestUser;
let admin2: TestUser;
let lead: TestUser;
let member: TestUser;
let stranger: TestUser;
let regionId: string;
let campaignId: string;
let territoryId: string;
let memberId: string;
let categoryId: number;
let liveRuleId: string;
const placeIds: string[] = [];
const ownerIds: string[] = [];
const ownerPhones: string[] = [];

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

/**
 * Programme settings are a single row guarded by an optimistic
 * `expectedUpdatedAt`, so every change has to read the current stamp first.
 * A patch that matches what is already there comes back 400 "Nothing
 * changed." — fine for a test fixture, so it is tolerated.
 */
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

const sweep = async (limit = 100) => {
  const { data, error } = await svc.rpc("fieldops_run_eligibility_sweep", {
    p_limit: limit,
  });
  expect(error, error?.message).toBeNull();
  return data as Record<string, number | boolean>;
};

const onboardingOf = async (id: string) => {
  const { data } = await svc
    .from("fieldops_onboarding")
    .select("status, flags, rule_id, holding_until, flag_details")
    .eq("id", id)
    .single();
  return data as {
    status: string;
    flags: string[];
    rule_id: string | null;
    holding_until: string | null;
    flag_details: Record<string, unknown>;
  };
};

const commissionOf = async (onboardingId: string) => {
  const { data } = await svc
    .from("fieldops_commission")
    .select("id, status, amount_minor, rule_version, approved_by, rule_id")
    .eq("onboarding_id", onboardingId)
    .is("reverses_commission_id", null)
    .maybeSingle();
  return data;
};

/** Moves the holding deadline into the past so the next sweep picks it up. */
const makeDue = (id: string) =>
  svc
    .from("fieldops_onboarding")
    .update({
      holding_until: new Date(Date.now() - 60_000).toISOString(),
    } as never)
    .eq("id", id);

const placeInput = (name: string, lat = 6.7215, lng = -1.3655) => ({
  name,
  categoryId,
  description:
    "A busy chop bar by the lorry station serving jollof, banku and tilapia every day from morning till late.",
  address: "Ejisu lorry station, Ejisu",
  location: { lat, lng },
  phoneE164: null,
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    dayOfWeek: d,
    openTime: "08:00",
    closeTime: "20:00",
    isClosed: false,
  })),
  cover: { publicId: "", version: "1" },
  photos: [] as { publicId: string; version: string }[],
});

async function addEvidence(onboardingId: string) {
  for (const kind of ["storefront", "interior"] as const) {
    const t = await requestEvidenceUploadCore(svc, member.id, {
      campaignId,
      onboardingId,
      kind,
      mimeType: "image/jpeg",
      sizeBytes: 1234,
      location: { lat: 6.7215, lng: -1.3655 },
      accuracyM: 10,
    });
    expect(t.status, t.message).toBe(200);
    await svc.storage
      .from(t.data?.bucket as string)
      .upload(t.data?.path as string, Buffer.from("not-really-a-jpeg"), {
        contentType: "image/jpeg",
      });
  }
}

/**
 * A whole onboarding taken from draft to `verified` by the lead, which is
 * where the sweep's job begins. Returns the ids the assertions need.
 */
async function onboardAndVerify(
  name: string,
  opts: {
    lat?: number;
    lng?: number;
    submitAt?: { lat: number; lng: number };
  } = {},
): Promise<{ onboardingId: string; placeId: string; ownerId: string }> {
  const start = await startOnboardingCore(svc, member.id, {
    campaignId,
    territoryId,
  });
  expect(start.status, start.message).toBe(200);
  const onboardingId = start.data?.id as string;

  const phone = `+2335${uniq}${ownerPhones.length}`;
  const { data: ownerUser } = await svc.auth.admin.createUser({
    phone,
    phone_confirm: true,
  });
  const ownerId = ownerUser.user?.id as string;
  ownerIds.push(ownerId);
  ownerPhones.push(phone);

  const sent = await requestOwnerOtpCore(
    svc,
    member.id,
    {
      campaignId,
      onboardingId,
      ownerFullName: "Auntie Ama",
      ownerPhoneE164: phone,
    },
    { sendOtp: fakeSend },
  );
  expect(sent.status, sent.message).toBe(200);
  const verified = await verifyOwnerOtpCore(
    svc,
    member.id,
    { campaignId, onboardingId, code: "1234" },
    { verifyOtp: fakeVerify },
  );
  expect(verified.status, verified.message).toBe(200);

  await addEvidence(onboardingId);
  const submitted = await submitOnboardingCore(svc, member.id, {
    campaignId,
    onboardingId,
    place: {
      ...placeInput(name, opts.lat, opts.lng),
      cover: { publicId: `place_photos/${member.id}/cover`, version: "1" },
      photos: [
        { publicId: `place_photos/${member.id}/a`, version: "1" },
        { publicId: `place_photos/${member.id}/b`, version: "1" },
      ],
    },
    submissionLocation: opts.submitAt ?? { lat: 6.7216, lng: -1.3656 },
    submissionAccuracyM: 12,
  });
  expect(submitted.status, submitted.message).toBe(200);
  const placeId = submitted.data?.placeId as string;
  placeIds.push(placeId);

  const reviewed = await reviewOnboardingCore(svc, lead.id, {
    campaignId,
    onboardingId,
    decision: "verified",
  });
  expect(reviewed.status, reviewed.message).toBe(200);
  return { onboardingId, placeId, ownerId };
}

beforeAll(async () => {
  // The OTP store, rate limiter and consent signer reach the database
  // through getSupabaseServiceClient(): point it at the local stack.
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  [admin, admin2, lead, member, stranger] = await Promise.all([
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

  const ctx = adminCtx(admin.id);
  await patchSettings(
    {
      programEnabled: true,
      commissionGenerationEnabled: true,
      requireMemberPhoneVerified: false,
      // Deterministic by default: the spot-check branch gets its own test.
      spotCheckBps: 0,
      dailySubmissionCap: 50,
    },
    "integration test",
  );

  const { data: region } = await svc
    .from("fieldops_region")
    .insert({ name: `FieldOps sweep ${uniq}`, country_code: "GH" } as never)
    .select("id")
    .single();
  regionId = region?.id as string;
  const created = await upsertCampaignCore(svc, ctx, {
    regionId,
    name: "Sweep campaign",
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

  // A campaign-scoped rule, so the programme default stays inactive and no
  // other suite starts minting commissions.
  const published = await publishCommissionRuleVersionCore(svc, ctx, {
    campaignId,
    activityKey: "place_onboarding_offline",
    amountMinor: 500,
    currency: "GHS",
    eligibility: {
      holding_days: 7,
      min_photos: 2,
      require_owner_phone_verified: true,
      require_inside_territory: true,
      max_distance_m: 200,
      min_description_chars: 80,
      require_opening_hours: true,
      require_contact: false,
      release_policy: "holding_period" as const,
    },
    note: "Integration test rule version.",
    reason: "integration test",
  });
  expect(published.status, published.message).toBe(200);
  liveRuleId = published.data?.id as string;
  // A different admin activates it: the publisher can't raise what's paid.
  const activated = await setCommissionRuleActiveCore(
    svc,
    adminCtx(admin2.id),
    {
      campaignId,
      activityKey: "place_onboarding_offline",
      ruleId: liveRuleId,
      reason: "integration test",
    },
  );
  expect(activated.status, activated.message).toBe(200);

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
  // fieldops_commission has no DELETE grant, even for service_role — the
  // ledger is append-only by design — and it pins the onboarding, campaign
  // and team rows behind it. So this tears down only what the ledger does
  // not reference; the local stack is thrown away by `npm run test:db:down`.
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
    [admin, admin2, lead, member, stranger].map((u) =>
      deleteTestUser(svc, u.id),
    ),
  );
});

describe("verification records a pending commission", () => {
  it("snapshots the live rule's amount and starts the holding period", async () => {
    const { onboardingId } = await onboardAndVerify("Ama's Chop Bar");
    const row = await onboardingOf(onboardingId);
    expect(row.status).toBe("verified");
    expect(row.rule_id).toBe(liveRuleId);
    expect(row.holding_until).toBeTruthy();

    const c = await commissionOf(onboardingId);
    expect(c?.status).toBe("pending");
    expect(Number(c?.amount_minor)).toBe(500);
    expect(c?.rule_id).toBe(liveRuleId);
    // Nothing has been approved: the lead's word alone never pays.
    expect(c?.approved_by).toBeNull();
  });

  it("leaves it alone until the holding period has elapsed", async () => {
    const { onboardingId } = await onboardAndVerify("Kofi's Barbering");
    const result = await sweep();
    // The sweep runs over the whole database, so only this row's fate is
    // asserted -- but nothing anywhere should ever error.
    expect(Number(result.failed)).toBe(0);
    expect((await onboardingOf(onboardingId)).status).toBe("verified");
    expect((await commissionOf(onboardingId))?.status).toBe("pending");
  });
});

describe("the sweep", () => {
  it("approves a commission and marks the onboarding succeeded when every check holds", async () => {
    const { onboardingId } = await onboardAndVerify("Yaa's Provisions");
    await makeDue(onboardingId);
    const result = await sweep();
    expect(Number(result.succeeded)).toBeGreaterThanOrEqual(1);
    expect(Number(result.failed)).toBe(0);

    expect((await onboardingOf(onboardingId)).status).toBe("succeeded");
    const c = await commissionOf(onboardingId);
    expect(c?.status).toBe("approved");
    // Approved by the sweep, not a person.
    expect(c?.approved_by).toBeNull();

    const { data: events } = await svc
      .from("fieldops_commission_event")
      .select("from_status, to_status, actor_kind")
      .eq("commission_id", c?.id as string)
      .order("id");
    expect(events?.map((e) => e.to_status)).toEqual(["pending", "approved"]);
    expect(events?.[1].actor_kind).toBe("system");
  });

  it("rejects the onboarding and the commission when the listing is hidden (hard failure)", async () => {
    const { onboardingId, placeId } = await onboardAndVerify("Ghost Kitchen");
    await svc
      .from("place")
      .update({ moderation_state: "hidden" } as never)
      .eq("id", placeId);
    await makeDue(onboardingId);
    await sweep();

    const row = await onboardingOf(onboardingId);
    expect(row.status).toBe("rejected");
    expect(row.flags).toContain("place_not_moderated");
    const c = await commissionOf(onboardingId);
    expect(c?.status).toBe("rejected");
  });

  it("rejects when the listing changed hands after verification", async () => {
    const { onboardingId, placeId } = await onboardAndVerify("Sold On Shop");
    await svc
      .from("place")
      .update({ owner_id: stranger.id } as never)
      .eq("id", placeId);
    await makeDue(onboardingId);
    await sweep();

    const row = await onboardingOf(onboardingId);
    expect(row.status).toBe("rejected");
    expect(row.flags).toContain("owner_matches");
    expect((await commissionOf(onboardingId))?.status).toBe("rejected");
  });

  it("flags, rather than pays, when a soft check fails", async () => {
    // Submitted from 3 km away: well past the rule's 200 m allowance.
    const { onboardingId } = await onboardAndVerify("Far Away Store", {
      submitAt: { lat: 6.75, lng: -1.39 },
    });
    await makeDue(onboardingId);
    await sweep();

    const row = await onboardingOf(onboardingId);
    expect(row.status).toBe("flagged");
    expect(row.flags).toContain("on_site");
    expect(row.flags).toContain("eligibility");
    // The money is untouched until an admin looks.
    expect((await commissionOf(onboardingId))?.status).toBe("pending");
  });

  it("flags a sampled onboarding even when everything passes", async () => {
    await patchSettings({ spotCheckBps: 10000 }, "spot check every row");

    const { onboardingId } = await onboardAndVerify("Sampled Store");
    await makeDue(onboardingId);
    await sweep();

    const row = await onboardingOf(onboardingId);
    expect(row.status).toBe("flagged");
    expect(row.flags).toContain("spot_check");
    expect(row.flags).not.toContain("eligibility");
    expect((await commissionOf(onboardingId))?.status).toBe("pending");

    await patchSettings({ spotCheckBps: 0 }, "back to deterministic");
  });

  it("holds the money back rather than approving over a campaign's budget cap", async () => {
    const { data: spent } = await svc
      .from("fieldops_commission")
      .select("amount_minor")
      .eq("campaign_id", campaignId)
      .in("status", ["approved", "in_payout", "paid"]);
    const committed = (spent ?? []).reduce(
      (t, r) => t + Number(r.amount_minor),
      0,
    );
    // A cap that exactly covers what is already committed: the next one
    // cannot fit.
    await svc
      .from("fieldops_campaign")
      .update({ budget_cap_minor: committed } as never)
      .eq("id", campaignId);

    const { onboardingId } = await onboardAndVerify("Over Budget Bar");
    await makeDue(onboardingId);
    await sweep();

    const row = await onboardingOf(onboardingId);
    expect(row.status).toBe("verified");
    expect(row.flags).toContain("budget_exhausted");
    expect((await commissionOf(onboardingId))?.status).toBe("pending");

    // Raising the cap lets the same row through on the next run.
    await svc
      .from("fieldops_campaign")
      .update({ budget_cap_minor: committed + 10_000 } as never)
      .eq("id", campaignId);
    await sweep();
    expect((await onboardingOf(onboardingId)).status).toBe("succeeded");
    expect((await commissionOf(onboardingId))?.status).toBe("approved");

    await svc
      .from("fieldops_campaign")
      .update({ budget_cap_minor: null } as never)
      .eq("id", campaignId);
  });

  it("keeps the amount a new rule version would change, and never double-pays", async () => {
    const { onboardingId } = await onboardAndVerify("Frozen Rate Shop");

    // The rate doubles AFTER verification.
    const v2 = await publishCommissionRuleVersionCore(svc, adminCtx(admin.id), {
      campaignId,
      activityKey: "place_onboarding_offline",
      amountMinor: 1000,
      currency: "GHS",
      eligibility: {
        holding_days: 7,
        min_photos: 2,
        require_inside_territory: true,
        max_distance_m: 200,
        min_description_chars: 80,
        require_opening_hours: true,
        require_contact: false,
        release_policy: "holding_period" as const,
      },
      note: "Integration test rule version.",
      reason: "rate rise",
    });
    expect(v2.status, v2.message).toBe(200);
    const live = await setCommissionRuleActiveCore(svc, adminCtx(admin2.id), {
      campaignId,
      activityKey: "place_onboarding_offline",
      ruleId: v2.data?.id as string,
      reason: "rate rise",
    });
    expect(live.status, live.message).toBe(200);

    await makeDue(onboardingId);
    await sweep();
    const c = await commissionOf(onboardingId);
    expect(c?.status).toBe("approved");
    // Still the version that was in force when the lead verified it.
    expect(Number(c?.amount_minor)).toBe(500);
    expect(c?.rule_id).toBe(liveRuleId);

    // A second sweep changes nothing and adds no second row.
    await sweep();
    const { count } = await svc
      .from("fieldops_commission")
      .select("id", { count: "exact", head: true })
      .eq("onboarding_id", onboardingId);
    expect(count).toBe(1);

    // Put the original rate back for the tests that follow.
    await setCommissionRuleActiveCore(svc, adminCtx(admin2.id), {
      campaignId,
      activityKey: "place_onboarding_offline",
      ruleId: liveRuleId,
      reason: "restore",
    });
  });

  it("does nothing at all while the programme is switched off", async () => {
    const { onboardingId } = await onboardAndVerify("Switched Off Shop");
    await makeDue(onboardingId);

    await patchSettings(
      { commissionGenerationEnabled: false },
      "kill switch test",
    );

    const result = await sweep();
    expect(result.skipped).toBe(true);
    expect((await onboardingOf(onboardingId)).status).toBe("verified");

    await patchSettings({ commissionGenerationEnabled: true }, "back on");
    await sweep();
    expect((await onboardingOf(onboardingId)).status).toBe("succeeded");
  });

  it("records every run in fieldops_job_run", async () => {
    const { data } = await svc
      .from("fieldops_job_run")
      .select("job, finished_at, failed")
      .eq("job", "eligibility_sweep")
      .order("started_at", { ascending: false })
      .limit(1);
    expect(data?.[0]?.finished_at).toBeTruthy();
    expect(data?.[0]?.failed).toBe(0);
  });
});

describe("the admin flag queue", () => {
  let flaggedId: string;

  it("lists what the sweep could not decide, with the pending amount", async () => {
    const { onboardingId } = await onboardAndVerify("Queue Me Store", {
      submitAt: { lat: 6.75, lng: -1.39 },
    });
    await makeDue(onboardingId);
    await sweep();
    flaggedId = onboardingId;

    const queue = await listFlagQueueAdminCore(svc, adminCtx(admin.id), {
      campaignId,
    });
    expect(queue.status, queue.message).toBe(200);
    const item = queue.data?.items.find((i) => i.onboarding.id === flaggedId);
    expect(item).toBeTruthy();
    expect(item?.commission?.amountMinor).toBe(500);
    expect(item?.flags).toContain("on_site");
  });

  it("approves a flag: the commission becomes payable with the admin recorded", async () => {
    const decided = await decideFlagAdminCore(svc, adminCtx(admin.id), {
      onboardingId: flaggedId,
      decision: "succeeded",
      note: "Checked the photos; the pin was just wrong.",
    });
    expect(decided.status, decided.message).toBe(200);
    expect((await onboardingOf(flaggedId)).status).toBe("succeeded");
    const c = await commissionOf(flaggedId);
    expect(c?.status).toBe("approved");
    expect(c?.approved_by).toBe(admin.id);

    const { data: audit } = await svc
      .from("admin_audit_log")
      .select("action")
      .eq("target_id", flaggedId)
      .eq("action", "fieldops.flag.succeeded");
    expect(audit?.length).toBe(1);
  });

  it("rejects a flag, and needs a reason to do it", async () => {
    const { onboardingId } = await onboardAndVerify("Reject Me Store", {
      submitAt: { lat: 6.75, lng: -1.39 },
    });
    await makeDue(onboardingId);
    await sweep();

    const noReason = await decideFlagAdminCore(svc, adminCtx(admin.id), {
      onboardingId,
      decision: "rejected",
      note: "",
    });
    expect(noReason.status).toBe(400);

    const done = await decideFlagAdminCore(svc, adminCtx(admin.id), {
      onboardingId,
      decision: "rejected",
      note: "The business does not exist at that address.",
    });
    expect(done.status, done.message).toBe(200);
    expect((await onboardingOf(onboardingId)).status).toBe("rejected");
    expect((await commissionOf(onboardingId))?.status).toBe("rejected");
  });
});

describe("the ledger is immutable", () => {
  let commissionId: string;

  beforeAll(async () => {
    const { onboardingId } = await onboardAndVerify("Ledger Test Store");
    await makeDue(onboardingId);
    await sweep();
    commissionId = (await commissionOf(onboardingId))?.id as string;
  });

  it("refuses to change anything but the status, even on the service role", async () => {
    const { error } = await svc
      .from("fieldops_commission")
      .update({ amount_minor: 999_999 } as never)
      .eq("id", commissionId);
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/immutable/i);
  });

  it("refuses a status move that is not in the lifecycle", async () => {
    const { error } = await svc
      .from("fieldops_commission")
      .update({ status: "pending" } as never)
      .eq("id", commissionId);
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/cannot move/i);
  });

  it("has no DELETE at all", async () => {
    const { error } = await svc
      .from("fieldops_commission")
      .delete()
      .eq("id", commissionId);
    expect(error).not.toBeNull();
  });

  it("keeps its event trail append-only", async () => {
    const { data: row } = await svc
      .from("fieldops_commission_event")
      .select("id")
      .eq("commission_id", commissionId)
      .limit(1)
      .single();
    const { error } = await svc
      .from("fieldops_commission_event")
      .update({ reason: "rewritten" } as never)
      .eq("id", row?.id as number);
    expect(error?.message).toMatch(/append-only/i);
  });

  it("reverses by appending a negative offset, never by editing", async () => {
    const reversed = await reverseCommissionAdminCore(svc, adminCtx(admin.id), {
      commissionId,
      reason: "The listing turned out to be a duplicate.",
    });
    expect(reversed.status, reversed.message).toBe(200);

    const { data: after } = await svc
      .from("fieldops_commission")
      .select("id, status, amount_minor, reverses_commission_id")
      .or(`id.eq.${commissionId},reverses_commission_id.eq.${commissionId}`);
    const original = after?.find((r) => r.id === commissionId);
    expect(original?.status).toBe("reversed");
    // It was only approved, not paid, so no money left and no offset row is
    // needed to explain any.
    expect(after?.length).toBe(1);

    const second = await reverseCommissionAdminCore(svc, adminCtx(admin.id), {
      commissionId,
      reason: "Trying again",
    });
    expect(second.status).toBe(400);
  });

  it("offsets a PAID commission so the payout figures still add up", async () => {
    const { onboardingId } = await onboardAndVerify("Paid Then Reversed");
    await makeDue(onboardingId);
    await sweep();
    const c = await commissionOf(onboardingId);
    // Phase 4 moves these; here we simulate a completed payout.
    await svc
      .from("fieldops_commission")
      .update({ status: "in_payout" } as never)
      .eq("id", c?.id as string);
    await svc
      .from("fieldops_commission")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
      } as never)
      .eq("id", c?.id as string);

    const reversed = await reverseCommissionAdminCore(svc, adminCtx(admin.id), {
      commissionId: c?.id as string,
      reason: "Paid by mistake — the place was removed.",
    });
    expect(reversed.status, reversed.message).toBe(200);

    const { data: offset } = await svc
      .from("fieldops_commission")
      .select("amount_minor, status, reverses_commission_id")
      .eq("reverses_commission_id", c?.id as string)
      .single();
    expect(Number(offset?.amount_minor)).toBe(-500);
    expect(offset?.status).toBe("paid");
    // The paid rows net to zero: the money that left is still on record.
    expect(Number(offset?.amount_minor) + Number(c?.amount_minor)).toBe(0);
  });
});

describe("who can read the ledger", () => {
  it("shows a member their own commissions and their totals", async () => {
    const mine = await getMyEarningsCore(svc, member.id, { campaignId });
    expect(mine.status, mine.message).toBe(200);
    expect(mine.data?.commissions.length).toBeGreaterThan(0);
    expect(mine.data?.totals.approvedMinor).toBeGreaterThan(0);
    expect(
      mine.data?.commissions.every((c) => c.memberUserId === member.id),
    ).toBe(true);
    expect(mine.data?.liveRate?.amountMinor).toBe(500);
  });

  it("lets the member and their lead read the rows, and nobody else", async () => {
    const { data: asMember } = await member.client
      .from("fieldops_commission")
      .select("id")
      .eq("campaign_id", campaignId);
    expect((asMember ?? []).length).toBeGreaterThan(0);

    const { data: asLead } = await lead.client
      .from("fieldops_commission")
      .select("id")
      .eq("campaign_id", campaignId);
    expect((asLead ?? []).length).toBe((asMember ?? []).length);

    const { data: asStranger } = await stranger.client
      .from("fieldops_commission")
      .select("id")
      .eq("campaign_id", campaignId);
    expect(asStranger ?? []).toEqual([]);
  });

  it("refuses every client write", async () => {
    const { error: insert } = await member.client
      .from("fieldops_commission")
      .insert({
        campaign_id: campaignId,
        member_id: memberId,
        member_user_id: member.id,
        activity_key: "place_onboarding_offline",
        amount_minor: 100_000,
        idempotency_key: `cheat:${uniq}`,
      } as never);
    expect(insert).not.toBeNull();

    const { data: one } = await member.client
      .from("fieldops_commission")
      .select("id")
      .limit(1)
      .single();
    const { error: update } = await member.client
      .from("fieldops_commission")
      .update({ status: "paid" } as never)
      .eq("id", one?.id as string);
    expect(update).not.toBeNull();
  });

  it("gives the admin ledger the same rows with per-status totals", async () => {
    const list = await listCommissionsAdminCore(svc, adminCtx(admin.id), {
      campaignId,
    });
    expect(list.status, list.message).toBe(200);
    expect(list.data?.items.length).toBeGreaterThan(0);
    expect(list.data?.totals.approved).toBeGreaterThan(0);
  });
});

describe("health and reconciliation", () => {
  it("reports the sweep as caught up with nothing stuck", async () => {
    const { data } = await svc.rpc("fieldops_health");
    const h = data as Record<string, number | boolean>;
    expect(h.enabled).toBe(true);
    expect(Number(h.sweep_failures)).toBe(0);
    expect(Number(h.succeeded_without_commission)).toBe(0);
    expect(Number(h.approved_without_rule)).toBe(0);
  });

  it("finds no Field Ops drift in the financial reconciliation", async () => {
    const { data } = await svc.rpc("run_financial_reconciliation");
    const r = data as Record<string, number>;
    expect(Number(r.fieldops_succeeded_no_commission)).toBe(0);
    expect(Number(r.fieldops_commission_no_rule)).toBe(0);
  });
});
