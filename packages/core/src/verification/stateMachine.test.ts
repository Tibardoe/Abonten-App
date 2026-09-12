import type {
  VerificationAction,
  VerificationActorKind,
  VerificationStatus,
} from "@abonten/types/verificationType";
import { describe, expect, it } from "vitest";
import {
  actionsFor,
  canStartNewCase,
  canTransition,
  isEditable,
  isOpen,
  nextStatus,
  reasonRequired,
} from "./stateMachine";

// These assertions mirror the `v_to := case ...` block in
// public.verification_transition() (migration 20260912120000). If the SQL
// changes, this file must change with it — that is the point of having both.

const ALL_STATUSES: VerificationStatus[] = [
  "draft",
  "pending_review",
  "needs_info",
  "approved",
  "rejected",
  "withdrawn",
  "revoked",
];

const ALL_ACTIONS: VerificationAction[] = [
  "submit",
  "resubmit",
  "withdraw",
  "approve",
  "reject",
  "request_info",
  "revoke",
];

const ALL_ACTORS: VerificationActorKind[] = ["user", "admin", "system"];

// Every (status, action, actor) triple the RPC accepts. Anything not in this
// list must be refused.
const ALLOWED: [
  VerificationStatus,
  VerificationAction,
  VerificationActorKind,
  VerificationStatus,
][] = [
  ["draft", "submit", "user", "pending_review"],
  ["draft", "withdraw", "user", "withdrawn"],
  ["draft", "withdraw", "system", "withdrawn"],
  ["pending_review", "approve", "admin", "approved"],
  ["pending_review", "reject", "admin", "rejected"],
  ["pending_review", "request_info", "admin", "needs_info"],
  ["pending_review", "withdraw", "user", "withdrawn"],
  ["pending_review", "withdraw", "system", "withdrawn"],
  ["needs_info", "resubmit", "user", "pending_review"],
  ["needs_info", "reject", "admin", "rejected"],
  ["needs_info", "withdraw", "user", "withdrawn"],
  ["needs_info", "withdraw", "system", "withdrawn"],
  ["approved", "revoke", "admin", "revoked"],
  ["approved", "revoke", "system", "revoked"],
];

describe("verification state machine", () => {
  it("allows exactly the transitions the RPC allows", () => {
    for (const [from, action, actor, to] of ALLOWED) {
      expect(
        canTransition(from, action, actor),
        `${from} --${action}--> should be allowed for ${actor}`,
      ).toBe(true);
      expect(nextStatus(from, action, actor)).toBe(to);
    }
  });

  it("refuses every other combination", () => {
    const allowedKeys = new Set(ALLOWED.map(([f, a, k]) => `${f}|${a}|${k}`));
    for (const from of ALL_STATUSES) {
      for (const action of ALL_ACTIONS) {
        for (const actor of ALL_ACTORS) {
          if (allowedKeys.has(`${from}|${action}|${actor}`)) continue;
          expect(
            canTransition(from, action, actor),
            `${from} --${action}--> must be refused for ${actor}`,
          ).toBe(false);
          expect(nextStatus(from, action, actor)).toBeNull();
        }
      }
    }
  });

  it("never lets a user approve, reject or request information", () => {
    for (const from of ALL_STATUSES) {
      for (const action of ["approve", "reject", "request_info"] as const) {
        expect(canTransition(from, action, "user")).toBe(false);
      }
    }
  });

  it("never lets an admin submit or resubmit on the owner's behalf", () => {
    for (const from of ALL_STATUSES) {
      for (const action of ["submit", "resubmit"] as const) {
        expect(canTransition(from, action, "admin")).toBe(false);
      }
    }
  });

  it("never reopens a terminal status", () => {
    for (const from of ["rejected", "withdrawn", "revoked"] as const) {
      for (const action of ALL_ACTIONS) {
        for (const actor of ALL_ACTORS) {
          expect(canTransition(from, action, actor)).toBe(false);
        }
      }
    }
  });

  it("only ever revokes something that was approved", () => {
    for (const from of ALL_STATUSES) {
      for (const actor of ALL_ACTORS) {
        expect(canTransition(from, "revoke", actor)).toBe(
          from === "approved" && actor !== "user",
        );
      }
    }
  });

  it("lists the actions available to each actor", () => {
    expect(actionsFor("draft", "user").sort()).toEqual(["submit", "withdraw"]);
    expect(actionsFor("pending_review", "admin").sort()).toEqual([
      "approve",
      "reject",
      "request_info",
    ]);
    expect(actionsFor("needs_info", "user").sort()).toEqual([
      "resubmit",
      "withdraw",
    ]);
    expect(actionsFor("approved", "admin")).toEqual(["revoke"]);
    expect(actionsFor("approved", "user")).toEqual([]);
    expect(actionsFor("rejected", "admin")).toEqual([]);
  });

  it("requires a reason for exactly the decisions the applicant is shown", () => {
    expect(reasonRequired("reject")).toBe(true);
    expect(reasonRequired("request_info")).toBe(true);
    expect(reasonRequired("revoke")).toBe(true);
    expect(reasonRequired("approve")).toBe(false);
    expect(reasonRequired("submit")).toBe(false);
    expect(reasonRequired("resubmit")).toBe(false);
    expect(reasonRequired("withdraw")).toBe(false);
  });

  it("treats draft and needs_info as the editable statuses", () => {
    expect(isEditable("draft")).toBe(true);
    expect(isEditable("needs_info")).toBe(true);
    for (const s of [
      "pending_review",
      "approved",
      "rejected",
      "withdrawn",
      "revoked",
    ] as const) {
      expect(isEditable(s)).toBe(false);
    }
  });

  it("treats draft, pending_review and needs_info as open", () => {
    expect(ALL_STATUSES.filter(isOpen)).toEqual([
      "draft",
      "pending_review",
      "needs_info",
    ]);
  });

  it("lets a new case start only when nothing is open or approved", () => {
    expect(canStartNewCase(null)).toBe(true);
    expect(canStartNewCase(undefined)).toBe(true);
    expect(canStartNewCase("rejected")).toBe(true);
    expect(canStartNewCase("withdrawn")).toBe(true);
    expect(canStartNewCase("revoked")).toBe(true);
    // An approved case blocks a second one — the partial unique index
    // uq_verification_case_approved_per_subject enforces the same rule.
    expect(canStartNewCase("approved")).toBe(false);
    expect(canStartNewCase("draft")).toBe(false);
    expect(canStartNewCase("pending_review")).toBe(false);
    expect(canStartNewCase("needs_info")).toBe(false);
  });
});
