import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addVerificationNoteCore,
  decideVerificationCaseCore,
  getVerificationCaseDetailCore,
  listVerificationCasesCore,
  revokeVerificationCore,
} from "../admin/verification/verificationAdminCore";
import {
  getSubjectVerificationCore,
  removeVerificationEvidenceCore,
  requestVerificationEvidenceUploadCore,
  startVerificationCaseCore,
  submitVerificationCaseCore,
  withdrawVerificationCaseCore,
} from "../verification/verificationCaseCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Trust & Verification against a real local Supabase stack (PROJECT.md §30).
//
// What matters here and cannot be proved by a unit test: the RLS and grant
// boundary on four brand-new tables, the private bucket with no storage
// policies, and the verification_transition RPC as the single arbiter of the
// state machine — including the races two reviewers can create.

const svc = getServiceClient() as unknown as ServiceRoleClient;

function adminCtx(userId: string, permissions: string[]): AdminContext {
  return {
    userId,
    email: null,
    roles: ["operations"],
    permissions: permissions as AdminContext["permissions"],
    reauthenticatedAt: Date.now(),
  };
}

const FULL_ADMIN = [
  "verification.view",
  "verification.evidence",
  "verification.review",
  "verification.revoke",
  "users.view_pii",
];

let owner: TestUser;
let other: TestUser;
let admin: TestUser;
const placeIds: string[] = [];

async function makePlace(name: string, ownerId: string): Promise<string> {
  const slug = `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}`;
  const { data, error } = await svc
    .from("place")
    .insert({
      owner_id: ownerId,
      name,
      slug,
      description: "Integration test place",
      category_id: 1,
      location: "SRID=4326;POINT(-0.1870 5.6037)",
      address: { full_address: "Accra" },
      cover_public_id: "test/cover",
      cover_version: "1",
      status: "published",
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(`makePlace failed: ${error.message}`);
  placeIds.push(data.id);
  return data.id;
}

/** Opens a case and attaches one confirmed document, ready to submit. */
async function caseWithEvidence(placeId: string): Promise<string> {
  const started = await startVerificationCaseCore(svc, owner.id, {
    subjectType: "place",
    subjectId: placeId,
  });
  expect(started.status, started.message).toBe(200);
  const caseId = started.data?.caseId as string;

  const ticket = await requestVerificationEvidenceUploadCore(svc, owner.id, {
    caseId,
    evidenceType: "business_registration",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    fileName: "registration.pdf",
  });
  expect(ticket.status, ticket.message).toBe(200);

  const { error } = await svc.storage
    .from(ticket.data?.bucket as string)
    .uploadToSignedUrl(
      ticket.data?.path as string,
      ticket.data?.token as string,
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: "application/pdf" }),
      { contentType: "application/pdf" },
    );
  expect(error, error?.message).toBeNull();
  return caseId;
}

beforeAll(async () => {
  const service = getServiceClient();
  owner = await createTestUser(service);
  other = await createTestUser(service);
  admin = await createTestUser(service);
  // The programme ships off; open it for these tests only.
  await svc
    .from("verification_program_setting")
    .update({
      place_requests_enabled: true,
      organizer_requests_enabled: true,
      audience: "all",
    } as never)
    .eq("id", 1);
}, 60_000);

afterAll(async () => {
  const service = getServiceClient();
  await svc
    .from("verification_case")
    .delete()
    .in("requester_id", [owner.id, other.id, admin.id]);
  if (placeIds.length > 0) {
    await svc.from("place").delete().in("id", placeIds);
  }
  await svc
    .from("verification_program_setting")
    .update({
      place_requests_enabled: false,
      organizer_requests_enabled: false,
      audience: "staff",
    } as never)
    .eq("id", 1);
  await deleteTestUser(service, owner.id);
  await deleteTestUser(service, other.id);
  await deleteTestUser(service, admin.id);
}, 60_000);

describe("client privileges", () => {
  it("refuses every client write to the verification tables (42501)", async () => {
    const writes = [
      owner.client
        .from("verification_case")
        .insert({ subject_type: "place", requester_id: owner.id } as never),
      owner.client
        .from("verification_case")
        .update({ status: "approved" } as never)
        .eq("requester_id", owner.id),
      owner.client
        .from("verification_case")
        .delete()
        .eq("requester_id", owner.id),
      owner.client
        .from("verification_evidence")
        .insert({ case_id: owner.id } as never),
      owner.client.from("verification_event").insert({
        case_id: owner.id,
        actor_kind: "user",
        event_type: "approved",
      } as never),
      owner.client
        .from("verification_program_setting")
        .update({ place_requests_enabled: true } as never)
        .eq("id", 1),
    ];
    for (const w of writes) {
      const { error } = await w;
      expect(error?.code, error?.message).toBe("42501");
    }
  });

  it("lets no client read any verification row, not even their own", async () => {
    const placeId = await makePlace("Read Probe", owner.id);
    const caseId = await caseWithEvidence(placeId);

    const { data: mine } = await owner.client
      .from("verification_case")
      .select("id")
      .eq("id", caseId);
    expect(mine ?? []).toEqual([]);

    const { data: theirs } = await other.client
      .from("verification_case")
      .select("id")
      .eq("id", caseId);
    expect(theirs ?? []).toEqual([]);

    // Reviewer identities in particular must never reach a client.
    const { data: events } = await owner.client
      .from("verification_event")
      .select("actor_id");
    expect(events ?? []).toEqual([]);
  });

  it("refuses client execution of the state-machine RPCs", async () => {
    const placeId = await makePlace("RPC Probe", owner.id);
    const caseId = await caseWithEvidence(placeId);

    const { error: transitionErr } = await owner.client.rpc(
      "verification_transition" as never,
      {
        p_case_id: caseId,
        p_actor_id: owner.id,
        p_actor_kind: "admin",
        p_action: "approve",
      } as never,
    );
    expect(transitionErr).not.toBeNull();

    const { error: claimErr } = await owner.client.rpc(
      "approve_place_claim_and_verify" as never,
      { p_request_id: caseId, p_admin_id: owner.id } as never,
    );
    expect(claimErr).not.toBeNull();
  });

  it("refuses client writes to the verified cache columns", async () => {
    const placeId = await makePlace("Self Verify", owner.id);

    const { error: placeErr } = await owner.client
      .from("place")
      .update({ verified: true } as never)
      .eq("id", placeId);
    expect(placeErr?.code, placeErr?.message).toBe("42501");

    const { error: stampErr } = await owner.client
      .from("place")
      .update({ verified_at: new Date().toISOString() } as never)
      .eq("id", placeId);
    expect(stampErr?.code, stampErr?.message).toBe("42501");

    const { error: orgErr } = await owner.client
      .from("user_info")
      .update({ organizer_verified: true } as never)
      .eq("id", owner.id);
    expect(orgErr).not.toBeNull();
  });

  it("keeps evidence out of reach of the client storage API", async () => {
    const placeId = await makePlace("Storage Probe", owner.id);
    const caseId = await caseWithEvidence(placeId);
    const { data: rows } = await svc
      .from("verification_evidence")
      .select("storage_path")
      .eq("case_id", caseId);
    const path = rows?.[0]?.storage_path as string;

    const { data: signed } = await owner.client.storage
      .from("verification-evidence")
      .createSignedUrl(path, 60);
    expect(signed).toBeNull();

    const { data: listed } = await other.client.storage
      .from("verification-evidence")
      .list("place");
    expect(listed ?? []).toEqual([]);
  });

  it("refuses a file type the bucket does not allow", async () => {
    const placeId = await makePlace("Mime Probe", owner.id);
    const started = await startVerificationCaseCore(svc, owner.id, {
      subjectType: "place",
      subjectId: placeId,
    });
    const ticket = await requestVerificationEvidenceUploadCore(svc, owner.id, {
      caseId: started.data?.caseId as string,
      evidenceType: "other",
      mimeType: "application/pdf",
      sizeBytes: 16,
      fileName: "not-really.pdf",
    });
    // Same signed path, but the bytes claim a type the bucket refuses.
    const { error } = await svc.storage
      .from(ticket.data?.bucket as string)
      .uploadToSignedUrl(
        ticket.data?.path as string,
        ticket.data?.token as string,
        new Blob(["hello"], { type: "text/plain" }),
        { contentType: "text/plain" },
      );
    expect(error).not.toBeNull();
  });
});

describe("ownership and IDOR", () => {
  it("hides another user's place behind a 404", async () => {
    const placeId = await makePlace("Not Yours", owner.id);
    const res = await startVerificationCaseCore(svc, other.id, {
      subjectType: "place",
      subjectId: placeId,
    });
    expect(res.status).toBe(404);
  });

  it("refuses every action on a case the caller does not own", async () => {
    const placeId = await makePlace("IDOR Target", owner.id);
    const caseId = await caseWithEvidence(placeId);

    expect(
      (await submitVerificationCaseCore(svc, other.id, { caseId })).status,
    ).toBe(404);
    expect(
      (await withdrawVerificationCaseCore(svc, other.id, { caseId })).status,
    ).toBe(404);
    expect(
      (
        await requestVerificationEvidenceUploadCore(svc, other.id, {
          caseId,
          evidenceType: "other",
          mimeType: "image/jpeg",
          sizeBytes: 10,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await removeVerificationEvidenceCore(svc, other.id, {
          caseId,
          evidenceId: caseId,
        })
      ).status,
    ).toBe(404);
  });

  it("refuses organizer verification for somebody else", async () => {
    const res = await startVerificationCaseCore(svc, owner.id, {
      subjectType: "organizer",
      subjectId: other.id,
    });
    expect(res.status).toBe(404);
  });
});

describe("admin permissions", () => {
  it("refuses each action to an admin without its permission", async () => {
    const placeId = await makePlace("Perm Probe", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });

    const viewerOnly = adminCtx(admin.id, ["verification.view"]);
    expect(
      (
        await decideVerificationCaseCore(svc, viewerOnly, {
          caseId,
          decision: "approve",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await revokeVerificationCore(svc, viewerOnly, {
          caseId,
          reason: "no",
        })
      ).status,
    ).toBe(403);

    const noView = adminCtx(admin.id, ["dashboard.view"]);
    expect((await listVerificationCasesCore(svc, noView, {})).status).toBe(403);
    expect(
      (await getVerificationCaseDetailCore(svc, noView, caseId)).status,
    ).toBe(403);
  });

  it("withholds the document link from a reviewer without verification.evidence", async () => {
    const placeId = await makePlace("Evidence Perm", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });

    const noDocs = adminCtx(admin.id, [
      "verification.view",
      "verification.review",
    ]);
    const res = await getVerificationCaseDetailCore(svc, noDocs, caseId, {
      signDoc: async () => "https://example.test/signed",
    });
    expect(res.status).toBe(200);
    expect(res.data?.canOpenEvidence).toBe(false);
    expect(res.data?.evidence[0]?.url).toBeNull();
    // The metadata still shows, so a reviewer knows something was sent.
    expect(res.data?.evidence[0]?.evidenceType).toBe("business_registration");

    const withDocs = adminCtx(admin.id, FULL_ADMIN);
    const ok = await getVerificationCaseDetailCore(svc, withDocs, caseId, {
      signDoc: async () => "https://example.test/signed",
    });
    expect(ok.data?.canOpenEvidence).toBe(true);
    expect(ok.data?.evidence[0]?.url).toBe("https://example.test/signed");
  });

  it("never leaks an internal note into the owner's view", async () => {
    const placeId = await makePlace("Note Probe", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });
    await addVerificationNoteCore(svc, adminCtx(admin.id, FULL_ADMIN), {
      caseId,
      body: "INTERNAL-ONLY-SENTINEL",
    });

    const view = await getSubjectVerificationCore(svc, owner.id, {
      subjectType: "place",
      subjectId: placeId,
    });
    expect(JSON.stringify(view.data)).not.toContain("INTERNAL-ONLY-SENTINEL");
  });

  it("never leaks the reviewer's identity into the owner's view", async () => {
    const placeId = await makePlace("Reviewer Probe", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });
    await decideVerificationCaseCore(svc, adminCtx(admin.id, FULL_ADMIN), {
      caseId,
      decision: "reject",
      reason: "Send the current permit",
    });

    const view = await getSubjectVerificationCore(svc, owner.id, {
      subjectType: "place",
      subjectId: placeId,
    });
    const json = JSON.stringify(view.data);
    expect(json).not.toContain(admin.id);
    // The reason itself is meant to be read by the owner.
    expect(json).toContain("Send the current permit");
  });
});

describe("lifecycle", () => {
  it("runs start to approval and sets the cached flag", async () => {
    const placeId = await makePlace("Happy Path", owner.id);
    const caseId = await caseWithEvidence(placeId);

    const submitted = await submitVerificationCaseCore(svc, owner.id, {
      caseId,
    });
    expect(submitted.status, submitted.message).toBe(200);

    const approved = await decideVerificationCaseCore(
      svc,
      adminCtx(admin.id, FULL_ADMIN),
      { caseId, decision: "approve", expectedStatus: "pending_review" },
    );
    expect(approved.status, approved.message).toBe(200);

    const { data: place } = await svc
      .from("place")
      .select("verified, verified_at, verification_case_id")
      .eq("id", placeId)
      .single();
    expect(place?.verified).toBe(true);
    expect(place?.verified_at).toBeTruthy();
    expect(place?.verification_case_id).toBe(caseId);
  });

  it("refuses to submit with no evidence attached", async () => {
    const placeId = await makePlace("No Docs", owner.id);
    const started = await startVerificationCaseCore(svc, owner.id, {
      subjectType: "place",
      subjectId: placeId,
    });
    const res = await submitVerificationCaseCore(svc, owner.id, {
      caseId: started.data?.caseId as string,
    });
    expect(res.status).toBe(422);
  });

  it("drops an evidence row whose bytes never arrived", async () => {
    const placeId = await makePlace("Ghost Upload", owner.id);
    const caseId = await caseWithEvidence(placeId);
    // A second ticket that is never used.
    await requestVerificationEvidenceUploadCore(svc, owner.id, {
      caseId,
      evidenceType: "other",
      mimeType: "image/jpeg",
      sizeBytes: 500,
      fileName: "never-sent.jpg",
    });

    await submitVerificationCaseCore(svc, owner.id, { caseId });
    const { data: rows } = await svc
      .from("verification_evidence")
      .select("status, file_name")
      .eq("case_id", caseId);
    expect(rows?.length).toBe(1);
    expect(rows?.[0]?.status).toBe("uploaded");
    expect(rows?.[0]?.file_name).toBe("registration.pdf");
  });

  it("sends a case back for more information and accepts a resubmission", async () => {
    const placeId = await makePlace("Needs Info", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });

    const asked = await decideVerificationCaseCore(
      svc,
      adminCtx(admin.id, FULL_ADMIN),
      {
        caseId,
        decision: "request_info",
        reason: "The permit has expired — send the current one.",
      },
    );
    expect(asked.status, asked.message).toBe(200);

    const view = await getSubjectVerificationCore(svc, owner.id, {
      subjectType: "place",
      subjectId: placeId,
    });
    expect(view.data?.openCase?.status).toBe("needs_info");
    expect(view.data?.openCase?.decisionReason).toContain("expired");

    const again = await submitVerificationCaseCore(svc, owner.id, { caseId });
    expect(again.status, again.message).toBe(200);
    const { data: row } = await svc
      .from("verification_case")
      .select("status, decision_reason")
      .eq("id", caseId)
      .single();
    expect(row?.status).toBe("pending_review");
    // The old reason is cleared so a stale complaint is not shown again.
    expect(row?.decision_reason).toBeNull();
  });

  it("requires a reason to reject or ask for more", async () => {
    const placeId = await makePlace("Reason Required", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });

    const ctx = adminCtx(admin.id, FULL_ADMIN);
    expect(
      (
        await decideVerificationCaseCore(svc, ctx, {
          caseId,
          decision: "reject",
          reason: "   ",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await decideVerificationCaseCore(svc, ctx, {
          caseId,
          decision: "request_info",
        })
      ).status,
    ).toBe(400);
  });

  it("lets a rejected applicant start a fresh request", async () => {
    const placeId = await makePlace("Second Try", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });
    await decideVerificationCaseCore(svc, adminCtx(admin.id, FULL_ADMIN), {
      caseId,
      decision: "reject",
      reason: "Document did not match the business name.",
    });

    const view = await getSubjectVerificationCore(svc, owner.id, {
      subjectType: "place",
      subjectId: placeId,
    });
    expect(view.data?.canStart).toBe(true);
    expect(view.data?.lastClosedCase?.status).toBe("rejected");

    const retry = await startVerificationCaseCore(svc, owner.id, {
      subjectType: "place",
      subjectId: placeId,
    });
    expect(retry.status, retry.message).toBe(200);
  });

  it("revokes a live badge and clears the cached flag", async () => {
    const placeId = await makePlace("Revoke Me", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });
    await decideVerificationCaseCore(svc, adminCtx(admin.id, FULL_ADMIN), {
      caseId,
      decision: "approve",
    });

    const revoked = await revokeVerificationCore(
      svc,
      adminCtx(admin.id, FULL_ADMIN),
      { caseId, reason: "The registration turned out to be forged." },
    );
    expect(revoked.status, revoked.message).toBe(200);

    const { data: place } = await svc
      .from("place")
      .select("verified, verified_at, verification_case_id")
      .eq("id", placeId)
      .single();
    expect(place?.verified).toBe(false);
    expect(place?.verified_at).toBeNull();
    expect(place?.verification_case_id).toBeNull();
  });

  it("refuses a place that is not published", async () => {
    const placeId = await makePlace("Draft Place", owner.id);
    await svc
      .from("place")
      .update({ status: "draft" } as never)
      .eq("id", placeId);
    const res = await startVerificationCaseCore(svc, owner.id, {
      subjectType: "place",
      subjectId: placeId,
    });
    expect(res.status).toBe(409);
    expect(res.message).toMatch(/publish/i);
  });

  it("caps the number of attached documents", async () => {
    const placeId = await makePlace("Too Many", owner.id);
    const started = await startVerificationCaseCore(svc, owner.id, {
      subjectType: "place",
      subjectId: placeId,
    });
    const caseId = started.data?.caseId as string;
    for (let i = 0; i < 5; i += 1) {
      const t = await requestVerificationEvidenceUploadCore(svc, owner.id, {
        caseId,
        evidenceType: "other",
        mimeType: "image/jpeg",
        sizeBytes: 100,
        fileName: `doc-${i}.jpg`,
      });
      expect(t.status, t.message).toBe(200);
    }
    const overflow = await requestVerificationEvidenceUploadCore(
      svc,
      owner.id,
      {
        caseId,
        evidenceType: "other",
        mimeType: "image/jpeg",
        sizeBytes: 100,
        fileName: "one-too-many.jpg",
      },
    );
    expect(overflow.status).toBe(409);
  });
});

describe("races and invariants", () => {
  it("allows exactly one open case per subject", async () => {
    const placeId = await makePlace("One Open", owner.id);
    const [a, b] = await Promise.all([
      startVerificationCaseCore(svc, owner.id, {
        subjectType: "place",
        subjectId: placeId,
      }),
      startVerificationCaseCore(svc, owner.id, {
        subjectType: "place",
        subjectId: placeId,
      }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it("lets only one of two simultaneous approvals win", async () => {
    const placeId = await makePlace("Double Approve", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });

    const ctx = adminCtx(admin.id, FULL_ADMIN);
    const [a, b] = await Promise.all([
      decideVerificationCaseCore(svc, ctx, {
        caseId,
        decision: "approve",
        expectedStatus: "pending_review",
      }),
      decideVerificationCaseCore(svc, ctx, {
        caseId,
        decision: "approve",
        expectedStatus: "pending_review",
      }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it("refuses to approve a case the applicant already withdrew", async () => {
    const placeId = await makePlace("Withdrawn First", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });
    await withdrawVerificationCaseCore(svc, owner.id, { caseId });

    const res = await decideVerificationCaseCore(
      svc,
      adminCtx(admin.id, FULL_ADMIN),
      { caseId, decision: "approve" },
    );
    expect(res.status).toBe(409);
  });

  it("refuses to approve a place that was archived after submission", async () => {
    const placeId = await makePlace("Archived Later", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });
    await svc
      .from("place")
      .update({ status: "archived" } as never)
      .eq("id", placeId);

    const res = await decideVerificationCaseCore(
      svc,
      adminCtx(admin.id, FULL_ADMIN),
      { caseId, decision: "approve" },
    );
    expect(res.status).toBe(409);
  });

  it("revokes automatically when a verified place changes owner", async () => {
    const placeId = await makePlace("Sold On", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });
    await decideVerificationCaseCore(svc, adminCtx(admin.id, FULL_ADMIN), {
      caseId,
      decision: "approve",
    });

    // Ownership moving is what approve_place_claim does; the trigger fires
    // on the column change regardless of who wrote it.
    await svc
      .from("place")
      .update({ owner_id: other.id } as never)
      .eq("id", placeId);

    const { data: place } = await svc
      .from("place")
      .select("verified, verification_case_id")
      .eq("id", placeId)
      .single();
    expect(place?.verified).toBe(false);
    expect(place?.verification_case_id).toBeNull();

    const { data: row } = await svc
      .from("verification_case")
      .select("status")
      .eq("id", caseId)
      .single();
    expect(row?.status).toBe("revoked");

    const { data: events } = await svc
      .from("verification_event")
      .select("event_type, reason")
      .eq("case_id", caseId)
      .eq("event_type", "revoked");
    expect(events?.[0]?.reason).toBe("owner_changed");
  });

  it("logs a subject_changed event when a verified place is edited", async () => {
    const placeId = await makePlace("Renamed", owner.id);
    const caseId = await caseWithEvidence(placeId);
    await submitVerificationCaseCore(svc, owner.id, { caseId });
    await decideVerificationCaseCore(svc, adminCtx(admin.id, FULL_ADMIN), {
      caseId,
      decision: "approve",
    });

    // A no-op write must not log anything.
    const { data: before } = await svc
      .from("place")
      .select("name")
      .eq("id", placeId)
      .single();
    await svc
      .from("place")
      .update({ name: before?.name } as never)
      .eq("id", placeId);
    const { data: noEvents } = await svc
      .from("verification_event")
      .select("id")
      .eq("case_id", caseId)
      .eq("event_type", "subject_changed");
    expect(noEvents ?? []).toEqual([]);

    await svc
      .from("place")
      .update({ name: "Completely Different Business" } as never)
      .eq("id", placeId);
    const { data: events } = await svc
      .from("verification_event")
      .select("meta")
      .eq("case_id", caseId)
      .eq("event_type", "subject_changed");
    expect(events?.length).toBe(1);
    expect(JSON.stringify(events?.[0]?.meta)).toContain("name");
  });

  it("revokes an organizer badge when the account is banned", async () => {
    const banned = await createTestUser(getServiceClient());
    const started = await startVerificationCaseCore(svc, banned.id, {
      subjectType: "organizer",
      subjectId: banned.id,
    });
    const caseId = started.data?.caseId as string;
    const ticket = await requestVerificationEvidenceUploadCore(svc, banned.id, {
      caseId,
      evidenceType: "past_event_material",
      mimeType: "image/jpeg",
      sizeBytes: 64,
      fileName: "flyer.jpg",
    });
    await svc.storage
      .from(ticket.data?.bucket as string)
      .uploadToSignedUrl(
        ticket.data?.path as string,
        ticket.data?.token as string,
        new Blob([new Uint8Array([9, 9])], { type: "image/jpeg" }),
        { contentType: "image/jpeg" },
      );
    await submitVerificationCaseCore(svc, banned.id, { caseId });
    await decideVerificationCaseCore(svc, adminCtx(admin.id, FULL_ADMIN), {
      caseId,
      decision: "approve",
    });

    const { data: beforeBan } = await svc
      .from("user_info")
      .select("organizer_verified")
      .eq("id", banned.id)
      .single();
    expect(beforeBan?.organizer_verified).toBe(true);

    await svc
      .from("user_info")
      .update({ status_id: 3 } as never)
      .eq("id", banned.id);

    const { data: afterBan } = await svc
      .from("user_info")
      .select("organizer_verified, organizer_verification_case_id")
      .eq("id", banned.id)
      .single();
    expect(afterBan?.organizer_verified).toBe(false);
    expect(afterBan?.organizer_verification_case_id).toBeNull();

    const { data: row } = await svc
      .from("verification_case")
      .select("status")
      .eq("id", caseId)
      .single();
    expect(row?.status).toBe("revoked");

    await svc.from("verification_case").delete().eq("requester_id", banned.id);
    await deleteTestUser(getServiceClient(), banned.id);
  });
});

describe("claims stay decoupled", () => {
  it("approving a claim transfers ownership without verifying", async () => {
    const placeId = await makePlace("Claim Only", owner.id);
    const claimant = await createTestUser(getServiceClient());

    const { data: claim } = await svc
      .from("place_claim_request")
      .insert({ place_id: placeId, claimant_id: claimant.id } as never)
      .select("id")
      .single();

    await svc
      .from("user_info")
      .update({ is_admin: true } as never)
      .eq("id", admin.id);
    const { error } = await svc.rpc("approve_place_claim", {
      p_request_id: claim?.id as string,
      p_admin_id: admin.id,
    });
    expect(error, error?.message).toBeNull();

    const { data: place } = await svc
      .from("place")
      .select("owner_id, claimed, verified")
      .eq("id", placeId)
      .single();
    expect(place?.owner_id).toBe(claimant.id);
    expect(place?.claimed).toBe(true);
    // The whole point of the decoupling.
    expect(place?.verified).toBe(false);

    await svc
      .from("user_info")
      .update({ is_admin: false } as never)
      .eq("id", admin.id);
    await deleteTestUser(getServiceClient(), claimant.id);
  });

  it("approve-and-verify does both in one transaction", async () => {
    const placeId = await makePlace("Claim And Verify", owner.id);
    const claimant = await createTestUser(getServiceClient());

    const { data: claim } = await svc
      .from("place_claim_request")
      .insert({ place_id: placeId, claimant_id: claimant.id } as never)
      .select("id")
      .single();

    await svc
      .from("user_info")
      .update({ is_admin: true } as never)
      .eq("id", admin.id);
    const { error } = await svc.rpc("approve_place_claim_and_verify", {
      p_request_id: claim?.id as string,
      p_admin_id: admin.id,
    });
    expect(error, error?.message).toBeNull();

    const { data: place } = await svc
      .from("place")
      .select("owner_id, claimed, verified, verification_case_id")
      .eq("id", placeId)
      .single();
    expect(place?.owner_id).toBe(claimant.id);
    expect(place?.verified).toBe(true);
    expect(place?.verification_case_id).toBeTruthy();

    const { data: row } = await svc
      .from("verification_case")
      .select("status, source, claim_request_id")
      .eq("id", place?.verification_case_id as string)
      .single();
    expect(row?.status).toBe("approved");
    expect(row?.source).toBe("claim_review");
    expect(row?.claim_request_id).toBe(claim?.id);

    await svc
      .from("user_info")
      .update({ is_admin: false } as never)
      .eq("id", admin.id);
    await svc
      .from("verification_case")
      .delete()
      .eq("requester_id", claimant.id);
    await deleteTestUser(getServiceClient(), claimant.id);
  });
});
