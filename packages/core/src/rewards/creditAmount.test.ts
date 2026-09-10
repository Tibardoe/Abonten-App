import { describe, expect, it } from "vitest";
import {
  cedisToCreditMinor,
  creditMinorToCedis,
  formatCredit,
  formatCreditDelta,
} from "./creditAmount";

describe("credit amount conversion", () => {
  it("converts between pesewas and cedis", () => {
    expect(creditMinorToCedis(1240)).toBe(12.4);
    expect(cedisToCreditMinor(12.4)).toBe(1240);
    // Float noise from a UI input must not leak into the ledger.
    expect(cedisToCreditMinor(0.1 + 0.2)).toBe(30);
  });
});

describe("formatCredit", () => {
  it("shows the cedi sign and two decimals", () => {
    expect(formatCredit(1240)).toBe("GH₵ 12.40");
    expect(formatCredit(0)).toBe("GH₵ 0.00");
    expect(formatCredit(-200)).toBe("−GH₵ 2.00");
  });

  it("treats non-finite input as zero", () => {
    expect(formatCredit(Number.NaN)).toBe("GH₵ 0.00");
  });

  it("formats signed deltas", () => {
    expect(formatCreditDelta(300)).toBe("+GH₵ 3.00");
    expect(formatCreditDelta(-300)).toBe("−GH₵ 3.00");
    expect(formatCreditDelta(0)).toBe("GH₵ 0.00");
  });
});
