import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Identity verification end to end against the local stack, with the
// stand-in provider (IDENTITY_PROVIDER_OVERRIDE=test): starting a check,
// each verdict, a document seen on two accounts, staff decisions and
// revocation, the requirements (payouts), account deletion and the nightly
// housekeeping. Everything is the real database: identity_transition, the
// guard triggers and the grants.

process.env.IDENTITY_PROVIDER_OVERRIDE = "test";
process.env.IDENTITY_HASH_SECRET =
  "integration-identity-hash-secret-0123456789";

const { resetIdentitySettingsCache, readIdentitySettings } = await import(
  "../identity/identityProgram"
);
const {
  applyIdentityResult,
  cancelIdentityVerificationCore,
  completeTestIdentityCore,
  getIdentityOverviewCore,
  requireVerifiedIdentity,
  startIdentityVerificationCore,
} = await import("../identity/identityCore");
const {
  decideIdentityVerificationCore,
  revealIdentityPiiCore,
  revokeIdentityVerificationCore,
} = await import("../admin/identity/identityAdminCore");
const { invalidateMarketCache } = await import("../markets/marketConfig");

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("expected a value");
  return value;
}

const svc = getServiceClient() as unknown as Parameters<
  typeof getIdentityOverviewCore
>[0];
const raw = getServiceClient() as SupabaseClient<Database>;

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
let reviewer: TestUser;
let staff: AdminContext;

const START = {
  documentCountry: "GH",
  documentType: "GHANA_CARD",
  consent: true as const,
  locale: "en" as const,
};

async function setProgram(
  patch: Partial<
    Database["public"]["Tables"]["identity_program_setting"]["Update"]
  >,
) {
  const { error } = await raw
    .from("identity_program_setting")
    .update(patch)
    .eq("id", 1);
  if (error) throw new Error(error.message);
  resetIdentitySettingsCache();
}

async function person(userId: string) {
  const { data } = await raw
    .from("user_info")
    .select(
      "identity_verified, identity_valid_until, identity_verification_id, status_id",
    )
    .eq("id", userId)
    .single();
  return must(data);
}

async function attempt(id: string) {
  const { data } = await raw
    .from("identity_verification")
    .select("*")
    .eq("id", id)
    .single();
  return must(data);
}

async function start(userId: string): Promise<string> {
  const res = await startIdentityVerificationCore(svc, userId, START);
  expect([200, 201]).toContain(res.status);
  expect(res.data?.url).toContain("/identity/test?v=");
  return must(res.data?.verificationId);
}

async function clearAttempts(userId: string) {
  await raw.from("identity_verification").delete().eq("user_id", userId);
  await raw.from("user_info").update({ status_id: 1 }).eq("id", userId);
}

beforeAll(async () => {
  [alice, bob, carol, reviewer] = await Promise.all([
    createTestUser(raw),
    createTestUser(raw),
    createTestUser(raw),
    createTestUser(raw),
  ]);
  staff = {
    userId: reviewer.id,
    email: reviewer.email,
    roles: ["operations"],
    permissions: [
      "identity.view",
      "identity.view_pii",
      "identity.review",
      "identity.revoke",
    ],
    reauthenticatedAt: Date.now(),
  };
  invalidateMarketCache();
  await setProgram({
    enabled: true,
    audience: "all",
    auto_approve_clear: true,
    attempts_per_day: 10,
    attempts_per_30_days: 20,
    require_for_payouts: false,
  });
});

beforeEach(async () => {
  resetIdentitySettingsCache();
});

afterAll(async () => {
  await setProgram({
    enabled: false,
    audience: "staff",
    require_for_payouts: false,
    attempts_per_day: 3,
    attempts_per_30_days: 6,
  });
  for (const u of [alice, bob, carol, reviewer]) {
    if (!u) continue;
    await raw.from("identity_verification").delete().eq("user_id", u.id);
    await deleteTestUser(raw, u.id);
  }
});

describe("the tables are the service's", () => {
  it("refuses a signed-in person every identity table", async () => {
    for (const table of [
      "identity_verification",
      "identity_verification_event",
      "identity_program_setting",
    ] as const) {
      const { data, error } = await alice.client.from(table).select("*");
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
    const { error: insertError } = await alice.client
      .from("identity_verification")
      .insert({
        user_id: alice.id,
        provider: "test",
        document_country: "GH",
        document_type: "GHANA_CARD",
        verification_method: "biometric_kyc",
        provider_user_ref: "abn_forged",
        link_expires_at: new Date().toISOString(),
        consent_at: new Date().toISOString(),
        consent_notice_version: "x",
      } as never);
    expect(insertError).not.toBeNull();
  });

  it("does not let a person mark themselves verified", async () => {
    await alice.client
      .from("user_info")
      .update({
        identity_verified: true,
        identity_valid_until: "2099-01-01T00:00:00Z",
      } as never)
      .eq("id", alice.id);
    expect((await person(alice.id)).identity_verified).toBe(false);
  });

  it("refuses a person the identity functions", async () => {
    const { error } = await alice.client.rpc("identity_transition", {
      p_verification_id: "00000000-0000-0000-0000-000000000000",
      p_action: "approve",
      p_actor_kind: "staff",
    });
    expect(error).not.toBeNull();
  });
});

describe("a check with the stand-in provider", () => {
  beforeEach(async () => {
    await clearAttempts(alice.id);
    await raw
      .from("user_info")
      .update({
        identity_verified: false,
        identity_valid_until: null,
        identity_verification_id: null,
      } as never)
      .eq("id", alice.id);
  });

  it("approves a clear check and shows it", async () => {
    const id = await start(alice.id);
    // Starting again for the same document reopens the same link.
    expect(
      (await startIdentityVerificationCore(svc, alice.id, START)).data
        ?.verificationId,
    ).toBe(id);

    const done = await completeTestIdentityCore(svc, {
      verificationId: id,
      outcome: "clear",
    });
    expect(done).toMatchObject({ status: 200, data: { status: "approved" } });

    const p = await person(alice.id);
    expect(p.identity_verified).toBe(true);
    expect(p.identity_verification_id).toBe(id);
    expect(Date.parse(must(p.identity_valid_until))).toBeGreaterThan(
      Date.now(),
    );

    const row = await attempt(id);
    // Kept: the name, birth date, last four and keyed hashes. Never the number.
    expect(row.id_number_last4).toHaveLength(4);
    expect(row.id_number_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(
      `TEST${alice.id.replace(/-/g, "").slice(0, 12)}`,
    );

    const overview = await getIdentityOverviewCore(svc, alice.id);
    expect(overview.data?.state).toBe("verified");

    const { data: notice } = await raw
      .from("notification")
      .select("type")
      .eq("user_id", alice.id)
      .eq("type", "identity_approved");
    expect((notice ?? []).length).toBeGreaterThan(0);

    const { data: publicProfile } = await bob.client.rpc("get_public_profile", {
      p_username: must(
        (
          await raw
            .from("user_info")
            .select("username")
            .eq("id", alice.id)
            .single()
        ).data?.username,
      ),
    });
    expect(
      (publicProfile as { identity_verified?: boolean } | null)
        ?.identity_verified,
    ).toBe(true);
  });

  it("rejects an under-age person and a blocked check", async () => {
    const id = await start(alice.id);
    await completeTestIdentityCore(svc, {
      verificationId: id,
      outcome: "underage",
    });
    const row = await attempt(id);
    expect(row.status).toBe("rejected");
    expect(row.is_adult).toBe(false);
    expect((await person(alice.id)).identity_verified).toBe(false);
    const overview = await getIdentityOverviewCore(svc, alice.id);
    expect(overview.data?.state).toBe("rejected");
    expect(overview.data?.current?.outcome).toBe("underage");

    const id2 = await start(alice.id);
    await completeTestIdentityCore(svc, {
      verificationId: id2,
      outcome: "block",
    });
    expect((await attempt(id2)).status).toBe("rejected");
  });

  it("fails on a provider error and sends 'attention' to a person", async () => {
    const id = await start(alice.id);
    await completeTestIdentityCore(svc, {
      verificationId: id,
      outcome: "error",
    });
    expect((await attempt(id)).status).toBe("failed");

    const id2 = await start(alice.id);
    await completeTestIdentityCore(svc, {
      verificationId: id2,
      outcome: "attention",
    });
    expect((await attempt(id2)).status).toBe("needs_review");
    expect((await getIdentityOverviewCore(svc, alice.id)).data?.state).toBe(
      "in_review",
    );
  });

  it("lets the person cancel an unfinished check", async () => {
    const id = await start(alice.id);
    expect(
      (
        await cancelIdentityVerificationCore(svc, bob.id, {
          verificationId: id,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await cancelIdentityVerificationCore(svc, alice.id, {
          verificationId: id,
        })
      ).status,
    ).toBe(200);
    expect((await attempt(id)).status).toBe("cancelled");
  });

  it("stops after the day's attempts", async () => {
    await setProgram({ attempts_per_day: 1 });
    try {
      const id = await start(alice.id);
      await completeTestIdentityCore(svc, {
        verificationId: id,
        outcome: "error",
      });
      const again = await startIdentityVerificationCore(svc, alice.id, START);
      expect(again.status).toBe(429);
    } finally {
      await setProgram({ attempts_per_day: 10 });
    }
  });
});

describe("one document on two accounts", () => {
  it("sends the second account to review, where staff decide", async () => {
    await clearAttempts(bob.id);
    await clearAttempts(carol.id);
    const settings = await readIdentitySettings(svc, { fresh: true });

    const result = (verificationId: string, ref: string) => ({
      providerJobId: `job_${verificationId.slice(0, 8)}`,
      providerUserRef: ref,
      verificationId,
      status: "clear" as const,
      reason: null,
      riskLevel: "low",
      fraudDetected: false,
      providerDuplicate: false,
      fullName: "Kwame Asante Owusu",
      dateOfBirth: "1990-03-14",
      idNumber: "GHA-555666777-1",
      documentExpiresOn: "2032-01-01",
    });

    const first = await start(bob.id);
    const firstRow = await attempt(first);
    expect(
      await applyIdentityResult(
        svc,
        firstRow,
        result(first, firstRow.provider_user_ref),
        "clear",
        settings,
      ),
    ).toBe("approved");

    const second = await start(carol.id);
    const secondRow = await attempt(second);
    expect(
      await applyIdentityResult(
        svc,
        secondRow,
        result(second, secondRow.provider_user_ref),
        "clear",
        settings,
      ),
    ).toBe("needs_review");
    const reviewed = await attempt(second);
    expect(reviewed.matched_user_ids).toContain(bob.id);
    expect((await person(carol.id)).identity_verified).toBe(false);

    // A person can't see who else holds the document.
    const overview = await getIdentityOverviewCore(svc, carol.id);
    expect(JSON.stringify(overview)).not.toContain(bob.id);

    // Staff: reveal (audited), then reject with a reason.
    const pii = await revealIdentityPiiCore(svc, staff, {
      verificationId: second,
      reason: "duplicate document check",
    });
    expect(pii.data?.legalName).toBe("Kwame Asante Owusu");
    const { data: audit } = await raw
      .from("admin_audit_log")
      .select("action")
      .eq("target_id", second)
      .eq("action", "identity.pii.view");
    expect((audit ?? []).length).toBe(1);

    expect(
      (
        await decideIdentityVerificationCore(svc, staff, {
          verificationId: second,
          decision: "reject",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await decideIdentityVerificationCore(svc, staff, {
          verificationId: second,
          decision: "reject",
          reason: "document belongs to another account",
        })
      ).status,
    ).toBe(200);
    expect((await attempt(second)).status).toBe("rejected");

    // Revoking the first takes the flag away at once.
    expect(
      (
        await revokeIdentityVerificationCore(svc, staff, {
          verificationId: first,
          reason: "fraud investigation",
        })
      ).status,
    ).toBe(200);
    expect((await person(bob.id)).identity_verified).toBe(false);
    expect((await attempt(first)).status).toBe("revoked");
  });

  it("refuses staff without the permission", async () => {
    const res = await revealIdentityPiiCore(
      svc,
      { ...staff, permissions: ["identity.view"] },
      {
        verificationId: "00000000-0000-0000-0000-000000000000",
        reason: "x x x x x",
      },
    );
    expect(res.status).toBe(403);
  });
});

describe("requirements", () => {
  it("holds payouts for the unverified only while the requirement is on", async () => {
    await clearAttempts(carol.id);
    expect(await requireVerifiedIdentity(svc, carol.id, "payouts")).toBeNull();
    await setProgram({ require_for_payouts: true });
    try {
      const held = await requireVerifiedIdentity(svc, carol.id, "payouts");
      expect(held?.status).toBe(409);

      const id = await start(carol.id);
      await completeTestIdentityCore(svc, {
        verificationId: id,
        outcome: "clear",
      });
      expect(
        await requireVerifiedIdentity(svc, carol.id, "payouts"),
      ).toBeNull();
    } finally {
      await setProgram({ require_for_payouts: false });
    }
  });

  it("never holds anyone while the programme is off", async () => {
    await setProgram({ enabled: false, require_for_payouts: true });
    try {
      expect(await requireVerifiedIdentity(svc, bob.id, "payouts")).toBeNull();
    } finally {
      await setProgram({ enabled: true, require_for_payouts: false });
    }
  });
});

describe("account deletion and housekeeping", () => {
  it("clears the flag and stops open checks when the account is deleted", async () => {
    await clearAttempts(alice.id);
    const done = await start(alice.id);
    await completeTestIdentityCore(svc, {
      verificationId: done,
      outcome: "clear",
    });
    expect((await person(alice.id)).identity_verified).toBe(true);

    await raw.from("user_info").update({ status_id: 4 }).eq("id", alice.id);
    const p = await person(alice.id);
    expect(p.identity_verified).toBe(false);
    const row = await attempt(done);
    expect(row.account_deleted_at).not.toBeNull();
    // Kept for tracing after an incident (retention_days_after_deletion).
    expect(row.legal_name).not.toBeNull();
    await raw.from("user_info").update({ status_id: 1 }).eq("id", alice.id);
  });

  it("expires links nobody finished", async () => {
    await clearAttempts(bob.id);
    const id = await start(bob.id);
    await raw
      .from("identity_verification")
      // A day's grace after the link's own expiry, for a late verdict.
      .update({
        link_expires_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      })
      .eq("id", id);
    const { error } = await raw.rpc("identity_housekeeping");
    expect(error).toBeNull();
    expect((await attempt(id)).status).toBe("expired");
  });
});
