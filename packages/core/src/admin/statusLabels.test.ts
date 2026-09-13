import { describe, expect, it } from "vitest";
import {
  STATUS_LABELS,
  healthCheckLabel,
  humanizeStatus,
  reportTargetLabel,
  statusMeta,
} from "./statusLabels";

describe("statusMeta", () => {
  it("turns the database words an operator should never see into English", () => {
    expect(statusMeta("ledgerEntry", "refund_hold").label).toBe(
      "Refund deducted",
    );
    expect(statusMeta("transaction", "refund_pending").label).toBe(
      "Refund pending",
    );
    expect(statusMeta("rewardEvent", "clawed_back").label).toBe("Clawed back");
    expect(statusMeta("verification", "needs_info").label).toBe(
      "Waiting on the applicant",
    );
    expect(statusMeta("userAccount", 2).label).toBe("Suspended");
  });

  it("still reads as words when a value has not been mapped yet", () => {
    const meta = statusMeta("transaction", "some_new_state");
    expect(meta.label).toBe("Some new state");
    expect(meta.tone).toBe("neutral");
  });

  it("renders a dash for a missing value instead of 'undefined'", () => {
    expect(statusMeta("payout", null).label).toBe("—");
    expect(statusMeta("payout", "").label).toBe("—");
  });

  it("gives every status an icon, so colour is never the only signal", () => {
    for (const family of Object.values(STATUS_LABELS)) {
      for (const meta of Object.values(family)) {
        expect(meta.icon).toBeTruthy();
        expect(meta.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("covers every status the money tables can hold", () => {
    // These lists come from the CHECK constraints in supabase/migrations.
    const transaction = [
      "successful",
      "pending",
      "failed",
      "refunded",
      "refund_pending",
    ];
    for (const s of transaction) {
      expect(STATUS_LABELS.transaction[s]).toBeDefined();
    }
    for (const s of ["processing", "completed", "failed", "cancelled"]) {
      expect(STATUS_LABELS.payout[s]).toBeDefined();
    }
    for (const s of [
      "earning",
      "refund_adjustment",
      "refund_hold",
      "refund_release",
      "payout_hold",
      "payout_release",
      "promoter_commission",
      "promoter_commission_reversal",
    ]) {
      expect(STATUS_LABELS.ledgerEntry[s]).toBeDefined();
    }
    for (const s of ["fee", "fee_refund_adjustment"]) {
      expect(STATUS_LABELS.feeEntry[s]).toBeDefined();
    }
  });
});

describe("labels for keys the console renders", () => {
  it("names each dependency the health probes cover", () => {
    expect(healthCheckLabel("self")).toBe("Web endpoint");
    expect(healthCheckLabel("hubtel")).toBe("Hubtel (SMS codes)");
    expect(healthCheckLabel("brand_new_probe")).toBe("Brand new probe");
  });

  it("names what a report is about", () => {
    expect(reportTargetLabel("event_review")).toBe("Review of an event");
    expect(reportTargetLabel("user")).toBe("Person");
  });

  it("humanizes dotted and underscored keys alike", () => {
    expect(humanizeStatus("reward.accrue")).toBe("Reward accrue");
    expect(humanizeStatus("first_order")).toBe("First order");
  });
});
