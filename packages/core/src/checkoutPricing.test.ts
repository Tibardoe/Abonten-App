import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVICE_FEE_RATE,
  allocatePromoEligibility,
  computeCheckoutFee,
  computeLineAmount,
} from "./checkoutPricing";

describe("allocatePromoEligibility", () => {
  it("marks every unit eligible when uses are unlimited", () => {
    const result = allocatePromoEligibility(
      [
        { id: "a", quantity: 3 },
        { id: "b", quantity: 5 },
      ],
      null,
    );
    expect(result).toEqual({ a: 3, b: 5 });
  });

  it("allocates first-come across lines until uses run out", () => {
    const result = allocatePromoEligibility(
      [
        { id: "a", quantity: 3 },
        { id: "b", quantity: 5 },
      ],
      4,
    );
    // First line takes all 3 of its units (3 <= 4 remaining), leaving 1 for
    // the second line even though it requested 5.
    expect(result).toEqual({ a: 3, b: 1 });
  });

  it("gives zero eligible units to a line once uses are exhausted", () => {
    const result = allocatePromoEligibility(
      [
        { id: "a", quantity: 5 },
        { id: "b", quantity: 2 },
      ],
      5,
    );
    expect(result).toEqual({ a: 5, b: 0 });
  });
});

describe("computeLineAmount", () => {
  it("applies no discount when discountPercentage is 0", () => {
    const { discount, amount } = computeLineAmount(2, 100, 0, 2, "GHS");
    expect(discount).toBe(0);
    expect(amount).toBe(200);
  });

  it("discounts only the eligible units, not the full quantity", () => {
    // 4 units at 100 each = 400. Only 2 units are eligible for a 10% discount.
    const { discount, amount } = computeLineAmount(4, 100, 10, 2, "GHS");
    expect(discount).toBe(20); // 10% of (100 * 2 eligible units)
    expect(amount).toBe(380); // 400 - 20
  });

  it("floors the amount at 0 instead of going negative", () => {
    // Pathological input (100% discount) should never produce a negative
    // charge even if upstream data is inconsistent.
    const { amount } = computeLineAmount(1, 100, 100, 1, "GHS");
    expect(amount).toBe(0);
  });

  it("rounds to what the currency can hold", () => {
    // 3 × 11.11 at 10%: 3.333 off; cedis keep two decimals.
    expect(computeLineAmount(3, 11.11, 10, 3, "GHS")).toEqual({
      discount: 3.33,
      amount: 30,
    });
    // Yen and CFA francs have no decimals: 15% of 3 × ¥999 = ¥449.55.
    expect(computeLineAmount(3, 999, 15, 3, "JPY")).toEqual({
      discount: 450,
      amount: 2547,
    });
    expect(computeLineAmount(1, 5000, 33, 1, "XOF")).toEqual({
      discount: 1650,
      amount: 3350,
    });
    // Kuwaiti dinars keep three.
    expect(computeLineAmount(2, 1.005, 10, 2, "KWD")).toEqual({
      discount: 0.201,
      amount: 1.809,
    });
  });
});

describe("computeCheckoutFee", () => {
  it("uses the default rate when none is supplied", () => {
    expect(computeCheckoutFee(1000)).toBe(1000 * DEFAULT_SERVICE_FEE_RATE);
  });

  it("charges nothing on a free (zero-amount) line", () => {
    expect(computeCheckoutFee(0)).toBe(0);
  });

  it("respects an explicit fee rate over the default", () => {
    expect(computeCheckoutFee(1000, 0.1)).toBe(100);
  });

  it("returns a 2dp amount instead of a raw floating-point product", () => {
    // 24 * 0.05 is 1.2000000000000002 in binary floating point. The mobile
    // checkout screen rendered that in full, next to the Pay button.
    expect(computeCheckoutFee(24)).toBe(1.2);
    expect(computeCheckoutFee(0.1 + 0.2)).toBe(0.02);
  });

  it("rounds a half-pesewa up, matching toPesewas", () => {
    // 3.3 * 0.05 = 0.165 -> 0.17, the same pesewa Paystack is charged.
    expect(computeCheckoutFee(3.3)).toBe(0.17);
  });
});

describe("computeCheckoutFee in the order's currency", () => {
  it("rounds to whole francs for XOF and to thousandths for KWD", () => {
    // 5% of 1,010 XOF is 50.5 -> 51 francs, never 50.5.
    expect(computeCheckoutFee(1010, 0.05, "XOF")).toBe(51);
    // 5% of 1.234 KWD is 0.0617 -> 0.062.
    expect(computeCheckoutFee(1.234, 0.05, "KWD")).toBe(0.062);
    expect(computeCheckoutFee(24, 0.05, "GHS")).toBe(1.2);
  });
});
