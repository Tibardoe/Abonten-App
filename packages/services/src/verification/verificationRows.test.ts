import { describe, expect, it } from "vitest";
import {
  type EventRow,
  evidencePath,
  mapHistory,
  transitionArgs,
  transitionError,
} from "./verificationRows";

function ev(partial: Partial<EventRow>): EventRow {
  return {
    id: 1,
    case_id: "case-1",
    actor_id: "admin-1",
    actor_kind: "admin",
    event_type: "approved",
    from_status: "pending_review",
    to_status: "approved",
    reason: null,
    meta: null,
    created_at: "2026-09-12T10:00:00Z",
    ...partial,
  };
}

describe("transitionError", () => {
  const cases: [string, number][] = [
    ["verification_case_not_found", 404],
    ["verification_status_changed", 409],
    ["verification_invalid_transition: draft -> approve by admin", 409],
    ["verification_reason_required", 400],
    ["verification_no_evidence", 422],
    ["verification_subject_ineligible", 409],
  ];

  it.each(cases)("maps %s to %i", (message, status) => {
    expect(transitionError({ message }).status).toBe(status);
  });

  it("treats a deadlock as retryable rather than a server error", () => {
    const result = transitionError({
      message: "deadlock detected",
      code: "40P01",
    });
    expect(result.status).toBe(409);
    expect(result.message).toMatch(/try again/i);
  });

  it("falls back to 500 for anything unrecognised", () => {
    expect(transitionError({ message: "connection reset" }).status).toBe(500);
  });

  it("never leaks the raw database message to the caller", () => {
    const result = transitionError({
      message:
        'duplicate key value violates unique constraint "uq_x" for user 1234',
    });
    expect(result.message).not.toMatch(/constraint|uq_x|1234/);
  });
});

describe("transitionArgs", () => {
  it("omits reason and expectedStatus rather than sending null", () => {
    const args = transitionArgs({
      caseId: "c1",
      actorId: "u1",
      actorKind: "user",
      action: "submit",
    });
    expect(args).toEqual({
      p_case_id: "c1",
      p_actor_id: "u1",
      p_actor_kind: "user",
      p_action: "submit",
    });
    expect("p_reason" in args).toBe(false);
    expect("p_expected_status" in args).toBe(false);
  });

  it("trims the reason and keeps the expected status", () => {
    const args = transitionArgs({
      caseId: "c1",
      actorId: "a1",
      actorKind: "admin",
      action: "reject",
      reason: "  the certificate is expired  ",
      expectedStatus: "pending_review",
    });
    expect(args.p_reason).toBe("the certificate is expired");
    expect(args.p_expected_status).toBe("pending_review");
  });

  it("drops a whitespace-only reason so the RPC raises its own error", () => {
    const args = transitionArgs({
      caseId: "c1",
      actorId: "a1",
      actorKind: "admin",
      action: "reject",
      reason: "   ",
    });
    expect("p_reason" in args).toBe(false);
  });
});

describe("mapHistory", () => {
  it("never exposes the reviewer's identity to the applicant", () => {
    const [entry] = mapHistory([ev({ actor_id: "secret-admin-id" })]);
    expect(JSON.stringify(entry)).not.toContain("secret-admin-id");
    expect(entry.actorKind).toBe("admin");
  });

  it("hides internal-only events from the applicant's timeline", () => {
    const rows = [
      ev({ id: 1, event_type: "submitted" }),
      ev({ id: 2, event_type: "subject_changed" }),
      ev({ id: 3, event_type: "evidence_purged" }),
      ev({ id: 4, event_type: "evidence_added" }),
      ev({ id: 5, event_type: "approved" }),
    ];
    expect(mapHistory(rows).map((h) => h.eventType)).toEqual([
      "submitted",
      "approved",
    ]);
  });

  it("keeps the decision reason, which the applicant is shown anyway", () => {
    const [entry] = mapHistory([
      ev({ event_type: "rejected", reason: "Send the current permit" }),
    ]);
    expect(entry.reason).toBe("Send the current permit");
  });
});

describe("evidencePath", () => {
  it("scopes the object key by subject, then case, then evidence", () => {
    expect(evidencePath("place", "p-1", "c-1", "e-1", "application/pdf")).toBe(
      "place/p-1/c-1/e-1.pdf",
    );
  });

  it("maps each accepted MIME type to its extension", () => {
    expect(evidencePath("place", "p", "c", "e", "image/jpeg")).toMatch(
      /\.jpg$/,
    );
    expect(evidencePath("place", "p", "c", "e", "image/png")).toMatch(/\.png$/);
    expect(evidencePath("place", "p", "c", "e", "image/heic")).toMatch(
      /\.heic$/,
    );
    expect(evidencePath("organizer", "u", "c", "e", "image/webp")).toMatch(
      /^organizer\/u\/c\/e\.webp$/,
    );
  });

  it("falls back to .bin for anything unexpected", () => {
    expect(evidencePath("place", "p", "c", "e", "text/plain")).toMatch(
      /\.bin$/,
    );
  });
});
