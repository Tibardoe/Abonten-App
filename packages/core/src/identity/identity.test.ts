import { describe, expect, it } from "vitest";
import { parseIdentityConfig } from "./config";
import {
  type IdentityDecisionInput,
  ageOn,
  decideIdentityOutcome,
  idNumberLastFour,
  identityStateOf,
  identityTransitionTarget,
  isoDateOrNull,
  namesLikelyMatch,
  normalizeIdNumber,
  outcomeFromStored,
} from "./rules";

const clean: IdentityDecisionInput = {
  resultStatus: "clear",
  resultReason: null,
  fraudDetected: false,
  providerDuplicate: false,
  isAdult: true,
  documentExpiresOn: "2030-12-31",
  matchedAccounts: 0,
  matchedAccountClosedForCause: false,
  autoApproveClear: true,
  today: "2026-10-23",
};

describe("identity state machine", () => {
  it("lets the provider decide an open attempt, and staff only a reviewed one", () => {
    expect(identityTransitionTarget("processing", "approve", "provider")).toBe(
      "approved",
    );
    expect(identityTransitionTarget("processing", "approve", "staff")).toBe(
      null,
    );
    expect(identityTransitionTarget("needs_review", "approve", "staff")).toBe(
      "approved",
    );
    expect(
      identityTransitionTarget("needs_review", "approve", "provider"),
    ).toBe(null);
  });

  it("never lets the person approve or revoke", () => {
    for (const action of ["approve", "reject", "refer", "revoke"] as const) {
      for (const from of [
        "created",
        "submitted",
        "needs_review",
        "approved",
      ] as const) {
        expect(identityTransitionTarget(from, action, "user")).toBe(null);
      }
    }
  });

  it("revokes only a live check, and cancels only an unfinished one", () => {
    expect(identityTransitionTarget("approved", "revoke", "staff")).toBe(
      "revoked",
    );
    expect(identityTransitionTarget("rejected", "revoke", "staff")).toBe(null);
    expect(identityTransitionTarget("created", "cancel", "user")).toBe(
      "cancelled",
    );
    expect(identityTransitionTarget("processing", "cancel", "user")).toBe(null);
  });
});

describe("decideIdentityOutcome", () => {
  it("approves a clean check when auto-approval is on", () => {
    expect(decideIdentityOutcome(clean)).toEqual({
      action: "approve",
      outcome: null,
      reviewReason: null,
    });
  });

  it("sends a clean check to a person when auto-approval is off", () => {
    expect(
      decideIdentityOutcome({ ...clean, autoApproveClear: false }).action,
    ).toBe("refer");
  });

  it("rejects a blocked check with the reason the person can act on", () => {
    const d = decideIdentityOutcome({
      ...clean,
      resultStatus: "block",
      resultReason: "face_verification_failed",
    });
    expect(d).toMatchObject({ action: "reject", outcome: "face_mismatch" });
  });

  it("fails, not rejects, when the provider could not read the photos", () => {
    const d = decideIdentityOutcome({
      ...clean,
      resultStatus: "error",
      resultReason: "image_unavailable_or_invalid",
    });
    expect(d).toMatchObject({ action: "fail", outcome: "document_unreadable" });
  });

  it("rejects the under-age and expired documents whatever the provider said", () => {
    expect(decideIdentityOutcome({ ...clean, isAdult: false })).toMatchObject({
      action: "reject",
      outcome: "underage",
    });
    expect(
      decideIdentityOutcome({ ...clean, documentExpiresOn: "2026-10-22" }),
    ).toMatchObject({ action: "reject", outcome: "document_expired" });
  });

  it("refers a document already on another account instead of rejecting it", () => {
    expect(
      decideIdentityOutcome({ ...clean, matchedAccounts: 1 }),
    ).toMatchObject({
      action: "refer",
      reviewReason: "document_on_other_account",
    });
    // A stolen ID: the closed account may be the thief's, so a person looks.
    expect(
      decideIdentityOutcome({
        ...clean,
        matchedAccounts: 1,
        matchedAccountClosedForCause: true,
      }),
    ).toMatchObject({
      action: "refer",
      reviewReason: "document_on_closed_account",
    });
  });

  it("refers fraud signals, the provider's own duplicates and 'attention'", () => {
    expect(
      decideIdentityOutcome({ ...clean, fraudDetected: true }).reviewReason,
    ).toBe("fraud_signals");
    expect(
      decideIdentityOutcome({ ...clean, providerDuplicate: true }).reviewReason,
    ).toBe("provider_duplicate");
    expect(
      decideIdentityOutcome({ ...clean, resultStatus: "attention" }).action,
    ).toBe("refer");
  });
});

describe("what the person is shown", () => {
  it("maps the attempt that matters to a state", () => {
    expect(identityStateOf(null, false)).toBe("not_started");
    expect(identityStateOf({ status: "approved" }, true)).toBe("verified");
    // Approved but no longer live (past its date, account not active).
    expect(identityStateOf({ status: "approved" }, false)).toBe("expired");
    expect(identityStateOf({ status: "processing" }, false)).toBe(
      "in_progress",
    );
    expect(identityStateOf({ status: "needs_review" }, false)).toBe(
      "in_review",
    );
    expect(identityStateOf({ status: "revoked" }, false)).toBe("rejected");
    expect(identityStateOf({ status: "cancelled" }, false)).toBe("not_started");
  });

  it("explains a stored outcome", () => {
    expect(outcomeFromStored("expired", null, null, null)).toBe("not_finished");
    expect(
      outcomeFromStored("rejected", "clear", null, "document_on_other_account"),
    ).toBe("duplicate");
    expect(outcomeFromStored("rejected", "clear", null, "underage")).toBe(
      "underage",
    );
    expect(outcomeFromStored("revoked", "clear", null, "fraud")).toBe("other");
    expect(outcomeFromStored("approved", "clear", null, null)).toBe(null);
  });
});

describe("facts from the document", () => {
  it("counts age in whole years", () => {
    expect(ageOn("2008-10-24", "2026-10-23")).toBe(17);
    expect(ageOn("2008-10-23", "2026-10-23")).toBe(18);
    expect(ageOn("not a date", "2026-10-23")).toBe(null);
  });

  it("keeps only the characters of a document number", () => {
    expect(normalizeIdNumber("gha-123 456 789-0")).toBe("GHA1234567890");
    expect(idNumberLastFour("GHA-123456789-0")).toBe("7890");
    expect(idNumberLastFour("--")).toBe(null);
  });

  it("reads ISO dates and refuses the rest", () => {
    expect(isoDateOrNull("2030-01-31T00:00:00Z")).toBe("2030-01-31");
    expect(isoDateOrNull("31/01/2030")).toBe(null);
    expect(isoDateOrNull(20300131)).toBe(null);
  });

  it("matches names written in a different order or case", () => {
    expect(namesLikelyMatch("Ama K. Mensah", "MENSAH AMA KORKOR")).toBe(true);
    expect(namesLikelyMatch("Ama Mensah", "Kofi Mensah")).toBe(false);
    expect(namesLikelyMatch("Ɔkyeame Boateng", "okyeame boateng")).toBe(true);
    expect(namesLikelyMatch(null, "Ama")).toBe(false);
  });
});

describe("parseIdentityConfig", () => {
  it("keeps well-formed documents once and drops the rest", () => {
    expect(
      parseIdentityConfig({
        provider: "smile_id",
        documents: [
          { type: "GHANA_CARD", method: "biometric_kyc" },
          { type: "GHANA_CARD", method: "document_verification" },
          { type: "passport", method: "document_verification" },
          { type: "PASSPORT", method: "document_verification" },
          "VOTER_ID",
        ],
      }),
    ).toEqual({
      provider: "smile_id",
      documents: [
        { type: "GHANA_CARD", method: "biometric_kyc" },
        { type: "PASSPORT", method: "document_verification" },
      ],
    });
  });

  it("names no provider it does not know", () => {
    expect(parseIdentityConfig({ provider: "other" }).provider).toBe(null);
    expect(parseIdentityConfig(null)).toEqual({
      provider: null,
      documents: [],
    });
  });
});
