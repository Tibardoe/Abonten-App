import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFUND_POLICY,
  REFUND_POLICY_CHOICES,
  type RefundPolicy,
  buyerCancelDecision,
  isStricterRefundPolicy,
  parseRefundPolicy,
  refundDeadline,
  refundPolicyChoice,
  refundPolicyFromChoice,
  refundPolicyOf,
  ticketShowStart,
} from "./refundPolicy";

/** A policy the test knows is valid. */
function policyOf(kind: string, hours: number | null): RefundPolicy {
  const policy = parseRefundPolicy(kind, hours);
  if (!policy) throw new Error(`not a policy: ${kind} ${hours}`);
  return policy;
}

const start = new Date("2026-12-24T16:00:00Z");
const hoursBefore = (h: number) => new Date(start.getTime() - h * 3_600_000);

describe("parseRefundPolicy", () => {
  it("accepts the three kinds and the listed cut-offs", () => {
    expect(parseRefundPolicy("until_start", null)).toEqual(
      DEFAULT_REFUND_POLICY,
    );
    expect(parseRefundPolicy("until_cutoff", 48)).toEqual({
      kind: "until_cutoff",
      cutoffHours: 48,
    });
    expect(parseRefundPolicy("until_cutoff", "168")).toEqual({
      kind: "until_cutoff",
      cutoffHours: 168,
    });
    expect(parseRefundPolicy("none", 24)).toEqual({
      kind: "none",
      cutoffHours: null,
    });
  });

  it("refuses an unknown kind or a cut-off off the list", () => {
    expect(parseRefundPolicy("whenever", null)).toBeNull();
    expect(parseRefundPolicy("until_cutoff", 5)).toBeNull();
    expect(parseRefundPolicy("until_cutoff", null)).toBeNull();
  });

  it("reads an older row as the default", () => {
    expect(refundPolicyOf({})).toEqual(DEFAULT_REFUND_POLICY);
    expect(
      refundPolicyOf({ refund_policy: "until_cutoff", refund_cutoff_hours: 3 }),
    ).toEqual(DEFAULT_REFUND_POLICY);
  });
});

describe("isStricterRefundPolicy", () => {
  const cut24 = policyOf("until_cutoff", 24);
  const cut72 = policyOf("until_cutoff", 72);
  const none = policyOf("none", null);

  it("orders the policies from generous to strict", () => {
    expect(isStricterRefundPolicy(cut24, DEFAULT_REFUND_POLICY)).toBe(true);
    expect(isStricterRefundPolicy(cut72, cut24)).toBe(true);
    expect(isStricterRefundPolicy(none, cut72)).toBe(true);
  });

  it("lets a policy stay or become more generous", () => {
    expect(isStricterRefundPolicy(cut24, cut24)).toBe(false);
    expect(isStricterRefundPolicy(cut24, cut72)).toBe(false);
    expect(isStricterRefundPolicy(DEFAULT_REFUND_POLICY, none)).toBe(false);
    expect(isStricterRefundPolicy(none, none)).toBe(false);
  });
});

describe("ticketShowStart", () => {
  const occurrences = [
    { id: "a", starts_at: "2026-12-27T16:00:00Z" },
    { id: "b", starts_at: "2026-12-24T16:00:00Z" },
  ];

  it("uses the ticket's own date first", () => {
    expect(
      ticketShowStart({ occurrenceId: "a", eventStartsAt: null, occurrences }),
    ).toEqual(new Date("2026-12-27T16:00:00Z"));
  });

  it("falls back to the event start, then the first date", () => {
    expect(
      ticketShowStart({ eventStartsAt: "2026-12-20T10:00:00Z", occurrences }),
    ).toEqual(new Date("2026-12-20T10:00:00Z"));
    expect(ticketShowStart({ occurrences })).toEqual(
      new Date("2026-12-24T16:00:00Z"),
    );
    expect(ticketShowStart({})).toBeNull();
  });
});

describe("buyerCancelDecision", () => {
  it("refuses everyone once the show has started", () => {
    for (const paid of [true, false]) {
      const decision = buyerCancelDecision({
        policy: DEFAULT_REFUND_POLICY,
        showStart: start,
        paid,
        now: new Date(start.getTime() + 60_000),
      });
      expect(decision).toMatchObject({ allowed: false, reason: "started" });
    }
  });

  it("lets a free ticket go until the start, whatever the policy", () => {
    expect(
      buyerCancelDecision({
        policy: policyOf("none", null),
        showStart: start,
        paid: false,
        now: hoursBefore(1),
      }).allowed,
    ).toBe(true);
  });

  it("refunds a paid ticket until the start by default", () => {
    expect(
      buyerCancelDecision({
        policy: DEFAULT_REFUND_POLICY,
        showStart: start,
        paid: true,
        now: hoursBefore(0.5),
      }),
    ).toEqual({ allowed: true, deadline: start });
  });

  it("closes paid refunds at the cut-off", () => {
    const policy = policyOf("until_cutoff", 48);
    expect(
      buyerCancelDecision({
        policy,
        showStart: start,
        paid: true,
        now: hoursBefore(49),
      }).allowed,
    ).toBe(true);
    expect(
      buyerCancelDecision({
        policy,
        showStart: start,
        paid: true,
        now: hoursBefore(47),
      }),
    ).toEqual({
      allowed: false,
      reason: "cutoff_passed",
      deadline: hoursBefore(48),
    });
  });

  it("never refunds a paid ticket under no refunds", () => {
    expect(
      buyerCancelDecision({
        policy: policyOf("none", null),
        showStart: start,
        paid: true,
        now: hoursBefore(500),
      }),
    ).toMatchObject({ allowed: false, reason: "no_refunds" });
  });

  it("with no known start, only no refunds refuses", () => {
    expect(
      buyerCancelDecision({
        policy: DEFAULT_REFUND_POLICY,
        showStart: null,
        paid: true,
      }).allowed,
    ).toBe(true);
    expect(refundDeadline(DEFAULT_REFUND_POLICY, null)).toBeNull();
  });
});

describe("form choices", () => {
  it("round-trips every choice", () => {
    for (const policy of REFUND_POLICY_CHOICES) {
      expect(refundPolicyFromChoice(refundPolicyChoice(policy))).toEqual(
        policy,
      );
    }
    expect(refundPolicyFromChoice("until_cutoff:5")).toBeNull();
  });
});
