import { describe, expect, it } from "vitest";
import {
  type CreditActivityRow,
  toCreditActivityItem,
} from "./creditActivityCopy";

function row(overrides: Partial<CreditActivityRow>): CreditActivityRow {
  return {
    id: "j1",
    journal_type: "bonus.grant",
    amount_minor: 500,
    label: null,
    source_type: null,
    source_id: null,
    lot_kind: "bonus",
    lot_status: "active",
    lot_expires_at: "2026-12-01T00:00:00Z",
    lot_release_at: null,
    created_at: "2026-09-10T10:00:00Z",
    ...overrides,
  };
}

describe("toCreditActivityItem", () => {
  it("shows a pending reward with its unlock date and source", () => {
    const item = toCreditActivityItem(
      row({
        journal_type: "reward.accrue",
        lot_kind: "reward",
        lot_status: "pending",
        label: "Afrochella",
        lot_release_at: "2026-12-30T00:00:00Z",
        source_type: "event",
        source_id: "e1",
      }),
    );
    expect(item.title).toBe("Reward");
    expect(item.state).toBe("pending");
    expect(item.subtitle).toBe("From Afrochella · pending");
    expect(item.releaseAt).toBe("2026-12-30T00:00:00Z");
    expect(item.expiresAt).toBeNull();
    expect(item.target).toEqual({ kind: "event", id: "e1" });
  });

  it("moves the same line to available once the lot is released", () => {
    const item = toCreditActivityItem(
      row({
        journal_type: "reward.accrue",
        lot_kind: "reward",
        lot_status: "active",
      }),
    );
    expect(item.state).toBe("available");
    expect(item.expiresAt).toBe("2026-12-01T00:00:00Z");
  });

  it("marks a voided reward as reversed with an explanation", () => {
    const item = toCreditActivityItem(
      row({
        journal_type: "reward.accrue",
        lot_kind: "reward",
        lot_status: "voided",
      }),
    );
    expect(item.state).toBe("reversed");
    expect(item.subtitle).toMatch(/refunded or cancelled/);
  });

  it("marks a fully spent grant as completed, not available", () => {
    expect(toCreditActivityItem(row({ lot_status: "exhausted" })).state).toBe(
      "completed",
    );
  });

  it("describes spending and expiry as negative lines", () => {
    const spent = toCreditActivityItem(
      row({
        journal_type: "redeem.capture",
        amount_minor: -300,
        label: "Ticket to X",
      }),
    );
    expect(spent.title).toBe("Used on Ticket to X");
    expect(spent.state).toBe("used");
    expect(spent.amountMinor).toBe(-300);

    const expired = toCreditActivityItem(
      row({ journal_type: "expire", amount_minor: -200 }),
    );
    expect(expired.title).toBe("Credit expired");
    expect(expired.state).toBe("expired");
  });

  it("ignores unknown source types rather than linking to them", () => {
    const item = toCreditActivityItem(
      row({ source_type: "adjustment_request", source_id: "r1" }),
    );
    expect(item.target).toBeNull();
  });
});
