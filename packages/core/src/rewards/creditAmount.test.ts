import { describe, expect, it } from "vitest";
import {
  creditMinorToMajor,
  formatCredit,
  formatCreditDelta,
  majorToCreditMinor,
} from "./creditAmount";

describe("credit amount conversion", () => {
  it("converts between minor and major units of the credit's currency", () => {
    expect(creditMinorToMajor(1240, "GHS")).toBe(12.4);
    expect(majorToCreditMinor(12.4, "GHS")).toBe(1240);
    // Float noise from a UI input must not leak into the ledger.
    expect(majorToCreditMinor(0.1 + 0.2, "GHS")).toBe(30);
    // A zero-decimal currency has no minor unit.
    expect(majorToCreditMinor(500, "XOF")).toBe(500);
  });
});

describe("formatCredit", () => {
  it("uses the credit currency's own sign", () => {
    expect(formatCredit(1240, "GHS")).toBe("GH₵12.40");
    expect(formatCredit(0, "GHS")).toBe("GH₵0.00");
    expect(formatCredit(-200, "GHS")).toBe("−GH₵2.00");
    expect(formatCredit(250000, "NGN")).toBe("₦2,500.00");
  });

  it("treats non-finite input as zero and never throws on an unknown code", () => {
    expect(formatCredit(Number.NaN, "GHS")).toBe("GH₵0.00");
    expect(formatCredit(1240, "")).toBe("12.40");
  });

  it("formats signed deltas", () => {
    expect(formatCreditDelta(300, "GHS")).toBe("+GH₵3.00");
    expect(formatCreditDelta(-300, "GHS")).toBe("−GH₵3.00");
    expect(formatCreditDelta(0, "GHS")).toBe("GH₵0.00");
  });
});
