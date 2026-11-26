import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Claiming a place someone runs is an ownership dispute (migration
// 20261126140000, @abonten/core/placeClaimInvite, docs/admin/claims.md):
//   * where a request stands is worked out on read
//     (place_claim_situation): the claimant runs it (owner / team_member),
//     nobody is behind it (owner_deleted / listed_by_abonten), or someone
//     else runs it (dispute);
//   * Admin › Claims labels disputes, lists them first among waiting
//     claims (across pages), and offers a disputes-only view;
//   * the guard on new requests refuses one from someone who runs the
//     place, and a dispute from someone whose last request for the same
//     place staff turned down less than 30 days ago (the same person could
//     otherwise file dispute after dispute); a place nobody runs can be
//     claimed again at once;
//   * approving a dispute needs the place's name typed, and the audit
//     entry records the dispute and the owner who lost the place.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getClaimDetailCore,
  listClaimsCore,
  reviewClaimCore,
} from "../admin/claims/claimsAdminCore";
import { createTeamCore } from "../teams/teamCore";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const DAY = 86_400_000;

describe("ownership disputes on place claims", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  let staff: TestUser;
  let ctx: AdminContext;
  const users: TestUser[] = [];
  const placeIds: string[] = [];
  const tag = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `cd_${tag()}`, full_name: `Claim Tester ${tag()}` })
      .eq("id", u.id);
    return u;
  }

  async function makePlace(
    ownerId: string,
    opts: { claimed?: boolean; name?: string } = {},
  ): Promise<string> {
    const { data, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: ownerId,
        name: opts.name ?? `Dispute Lounge ${tag()}`,
        slug: `dispute-lounge-${crypto.randomUUID()}`,
        description: "Integration test place",
        category_id: 1,
        location: "SRID=4326;POINT(-0.187 5.6037)",
        address: { full_address: "Osu, Accra" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
        claimed: opts.claimed ?? false,
      } as never)
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    const id = (data as { id: string }).id;
    placeIds.push(id);
    return id;
  }

  /** Files a claim the way the app does: a direct insert as the claimant. */
  async function fileAs(claimant: TestUser, placeId: string, note = "Mine") {
    return claimant.client
      .from("place_claim_request")
      .insert({
        place_id: placeId,
        claimant_id: claimant.id,
        note,
        status: "pending",
      })
      .select("id")
      .single();
  }

  async function file(claimant: TestUser, placeId: string): Promise<string> {
    const { data, error } = await fileAs(claimant, placeId);
    expect(error, error?.message).toBeNull();
    return (data as { id: string }).id;
  }

  async function situation(placeId: string, claimantId: string) {
    const { data, error } = await service.rpc("place_claim_situation", {
      p_place_id: placeId,
      p_claimant_id: claimantId,
    });
    expect(error, error?.message).toBeNull();
    return data;
  }

  async function backdate(claimId: string, ms: number) {
    await service
      .from("place_claim_request")
      .update({ created_at: new Date(Date.now() - ms).toISOString() })
      .eq("id", claimId);
  }

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    staff = await person();
    // An active staff account: what "listed by Abonten" keys on, and what
    // approve_place_claim checks (user_info.is_admin, kept in step).
    const { error } = await service
      .from("admin_user")
      .insert({ user_id: staff.id, status: "active" });
    expect(error, error?.message).toBeNull();
    ctx = {
      userId: staff.id,
      email: staff.email,
      roles: ["operations"],
      permissions: [
        "claims.view",
        "claims.review",
        "users.view_pii",
      ] as AdminContext["permissions"],
      reauthenticatedAt: Date.now(),
    };
  });

  afterAll(async () => {
    if (placeIds.length > 0) {
      await service
        .from("place_claim_request")
        .delete()
        .in("place_id", placeIds);
      await service.from("place").delete().in("id", placeIds);
    }
    await service.from("admin_user").delete().eq("user_id", staff.id);
    for (const u of users) await deleteTestUser(service, u.id);
  });

  it("works out where a request stands", async () => {
    const owner = await person();
    const stranger = await person();
    const owned = await makePlace(owner.id);
    const listed = await makePlace(staff.id);
    const claimedByStaff = await makePlace(staff.id, { claimed: true });
    const gone = await person();
    const orphaned = await makePlace(gone.id);
    await service.from("user_info").update({ status_id: 4 }).eq("id", gone.id);

    expect(await situation(owned, owner.id)).toBe("owner");
    expect(await situation(owned, stranger.id)).toBe("dispute");
    expect(await situation(listed, stranger.id)).toBe("listed_by_abonten");
    // Claimed is claimed, even by a staff account.
    expect(await situation(claimedByStaff, stranger.id)).toBe("dispute");
    expect(await situation(orphaned, stranger.id)).toBe("owner_deleted");
    expect(await situation(crypto.randomUUID(), stranger.id)).toBeNull();

    // A suspended owner is still the owner.
    await service.from("user_info").update({ status_id: 2 }).eq("id", owner.id);
    expect(await situation(owned, stranger.id)).toBe("dispute");
    await service.from("user_info").update({ status_id: 1 }).eq("id", owner.id);
  });

  it("refuses a request from the owner or a member of the owning team", async () => {
    const owner = await person();
    const place = await makePlace(owner.id);
    const own = await fileAs(owner, place);
    expect(own.error?.message).toContain("place_claim:runs_place");

    await service
      .from("team_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTeamSettingsCache();
    try {
      const teamOwner = await person();
      const member = await person();
      const made = await createTeamCore(svc, teamOwner.id, {
        adult: true,
        name: "Dispute Crew",
        username: `cdt_${tag()}`,
      });
      if (made.status !== 200) throw new Error(made.message);
      const teamId = made.data.id;
      const { error: joinError } = await service.from("team_member").insert({
        team_id: teamId,
        user_id: member.id,
        role: "door",
        status: "active",
        added_by: teamOwner.id,
      });
      expect(joinError, joinError?.message).toBeNull();
      const teamPlace = await makePlace(teamId, { claimed: true });

      expect(await situation(teamPlace, member.id)).toBe("team_member");
      const asMember = await fileAs(member, teamPlace);
      expect(asMember.error?.message).toContain("place_claim:runs_place");

      // The detail names the team and its Owners.
      const outsider = await person();
      const claimId = await file(outsider, teamPlace);
      const detail = await getClaimDetailCore(svc, ctx, claimId);
      expect(detail.status).toBe(200);
      expect(detail.data?.isDispute).toBe(true);
      expect(detail.data?.currentOwner).toMatchObject({
        id: teamId,
        kind: "team",
        teamStatus: "active",
      });
      expect(detail.data?.currentOwner?.teamOwners.map((o) => o.id)).toEqual([
        teamOwner.id,
      ]);
    } finally {
      await service
        .from("team_program_setting")
        .update({ enabled: false })
        .eq("id", 1);
      resetTeamSettingsCache();
    }
  });

  it("labels disputes and lists them first among waiting claims, page after page", async () => {
    const owner = await person();
    const claimant = await person();
    const owned = await makePlace(owner.id);
    const listed = await makePlace(staff.id);
    const gone = await person();
    const orphaned = await makePlace(gone.id);
    await service.from("user_info").update({ status_id: 4 }).eq("id", gone.id);

    // The dispute is the oldest of the three: by date alone it would come
    // last.
    const dispute = await file(claimant, owned);
    const onListed = await file(claimant, listed);
    const onOrphaned = await file(claimant, orphaned);
    await backdate(dispute, 3 * DAY);
    await backdate(onListed, 2 * DAY);
    await backdate(onOrphaned, DAY);

    const all = await listClaimsCore(svc, ctx, {
      status: "pending",
      pageSize: 200,
    });
    expect(all.status).toBe(200);
    const mine = all.data.filter((c) =>
      [dispute, onListed, onOrphaned].includes(c.id),
    );
    expect(mine.map((c) => [c.id, c.situation, c.isDispute])).toEqual([
      [dispute, "dispute", true],
      [onOrphaned, "owner_deleted", false],
      [onListed, "listed_by_abonten", false],
    ]);
    // Every dispute in the queue comes before every other waiting claim.
    const firstOther = all.data.findIndex((c) => !c.isDispute);
    if (firstOther >= 0) {
      expect(all.data.slice(firstOther).some((c) => c.isDispute)).toBe(false);
    }

    // Walking the queue two at a time gives the same order.
    const walked: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 200; i++) {
      const page = await listClaimsCore(svc, ctx, {
        status: "pending",
        pageSize: 2,
        cursor,
      });
      expect(page.status).toBe(200);
      walked.push(...page.data.map((c) => c.id));
      if (!page.hasNextPage) break;
      cursor = page.nextCursor;
    }
    expect(walked).toEqual(all.data.map((c) => c.id));

    // The disputes view holds disputes only, ours among them.
    const disputes = await listClaimsCore(svc, ctx, {
      disputesOnly: true,
      pageSize: 200,
    });
    expect(disputes.data.every((c) => c.isDispute)).toBe(true);
    expect(disputes.data.map((c) => c.id)).toContain(dispute);
    expect(disputes.data.map((c) => c.id)).not.toContain(onListed);

    // A claim becomes a dispute the moment someone else takes the place.
    const rival = await person();
    const rivalClaim = await file(rival, listed);
    const approved = await reviewClaimCore(svc, ctx, {
      claimId: rivalClaim,
      decision: "approve",
    });
    expect(approved.status, approved.message).toBe(200);
    const after = await listClaimsCore(svc, ctx, {
      status: "pending",
      pageSize: 200,
    });
    expect(after.data.find((c) => c.id === onListed)).toMatchObject({
      situation: "dispute",
      isDispute: true,
    });

    // A decided claim has no situation.
    const decided = await listClaimsCore(svc, ctx, {
      status: "approved",
      pageSize: 200,
    });
    expect(decided.data.find((c) => c.id === rivalClaim)).toMatchObject({
      situation: null,
      isDispute: false,
    });
  });

  it("names who runs the place and since when", async () => {
    const owner = await person();
    const claimant = await person();
    const place = await makePlace(owner.id);
    const claimId = await file(claimant, place);
    const detail = await getClaimDetailCore(svc, ctx, claimId);
    expect(detail.status).toBe(200);
    expect(detail.data).toMatchObject({
      situation: "dispute",
      isDispute: true,
      currentOwner: {
        id: owner.id,
        kind: "person",
        statusId: 1,
        sinceBasis: "listed",
      },
    });
  });

  it("waits 30 days before the same person disputes the same place again", async () => {
    const owner = await person();
    const claimant = await person();
    const place = await makePlace(owner.id, { claimed: true });

    const first = await file(claimant, place);
    // One waiting request at a time, as before.
    const twice = await fileAs(claimant, place);
    expect(twice.error?.code).toBe("23505");

    const rejected = await reviewClaimCore(svc, ctx, {
      claimId: first,
      decision: "reject",
      reason: "No proof",
    });
    expect(rejected.status, rejected.message).toBe(200);

    const again = await fileAs(claimant, place);
    expect(again.error?.message).toContain("place_claim:dispute_wait");
    // DETAIL says when they may ask again: 30 days after the decision.
    const retry = new Date(again.error?.details ?? "").getTime();
    expect(Math.abs(retry - (Date.now() + 30 * DAY))).toBeLessThan(10 * 60_000);

    // Field Ops and staff tools write as the service role: same rule.
    const viaService = await service
      .from("place_claim_request")
      .insert({ place_id: place, claimant_id: claimant.id } as never);
    expect(viaService.error?.message).toContain("place_claim:dispute_wait");

    // Someone else may still dispute it.
    const other = await person();
    await file(other, place);

    // After 30 days the person may ask again.
    await service
      .from("place_claim_request")
      .update({ reviewed_at: new Date(Date.now() - 31 * DAY).toISOString() })
      .eq("id", first);
    const later = await fileAs(claimant, place);
    expect(later.error, later.error?.message).toBeNull();
  });

  it("lets a turned-down claimant claim a place nobody runs again at once", async () => {
    const claimant = await person();
    const place = await makePlace(staff.id);
    const first = await file(claimant, place);
    const rejected = await reviewClaimCore(svc, ctx, {
      claimId: first,
      decision: "reject",
    });
    expect(rejected.status, rejected.message).toBe(200);
    const again = await fileAs(claimant, place);
    expect(again.error, again.error?.message).toBeNull();
  });

  it("approves a dispute only with the place's name typed, and audits who lost it", async () => {
    const owner = await person();
    const claimant = await person();
    const place = await makePlace(owner.id, {
      claimed: true,
      name: "Chez Ama Osu",
    });
    const claimId = await file(claimant, place);

    const bare = await reviewClaimCore(svc, ctx, {
      claimId,
      decision: "approve",
    });
    expect(bare.status).toBe(400);
    const wrong = await reviewClaimCore(svc, ctx, {
      claimId,
      decision: "approve",
      confirmPlaceName: "Chez Ama",
    });
    expect(wrong.status).toBe(400);
    const { data: still } = await service
      .from("place")
      .select("owner_id")
      .eq("id", place)
      .single();
    expect(still?.owner_id).toBe(owner.id);

    const ok = await reviewClaimCore(svc, ctx, {
      claimId,
      decision: "approve",
      confirmPlaceName: "  chez ama   OSU ",
      reason: "Registration certificate in the claimant's name",
    });
    expect(ok.status, ok.message).toBe(200);
    const { data: moved } = await service
      .from("place")
      .select("owner_id, claimed")
      .eq("id", place)
      .single();
    expect(moved).toMatchObject({ owner_id: claimant.id, claimed: true });

    const { data: audit } = await service
      .from("admin_audit_log")
      .select("action, summary, before, after")
      .eq("target_type", "place_claim")
      .eq("target_id", claimId)
      .single();
    expect(audit?.action).toBe("claim.approve");
    expect(audit?.summary).toContain("ownership dispute");
    expect(audit?.before).toMatchObject({
      situation: "dispute",
      owner_id: owner.id,
    });
    expect(audit?.after).toMatchObject({ dispute: true });
  });

  it("approves an ordinary claim without the typed name", async () => {
    const claimant = await person();
    const place = await makePlace(staff.id);
    const claimId = await file(claimant, place);
    const ok = await reviewClaimCore(svc, ctx, {
      claimId,
      decision: "approve",
    });
    expect(ok.status, ok.message).toBe(200);
  });
});
