import { describe, expect, it } from "vitest";
import { splitRefundTender } from "./refundTenderSplit";

describe("splitRefundTender", () => {
  it("returns cash-only orders entirely as cash", () => {
    expect(
      splitRefundTender({
        refundMinor: 10_000,
        cashMinor: 10_500,
        creditMinor: 0,
      }),
    ).toEqual({ creditBackMinor: 0, cashBackMinor: 10_000 });
  });

  it("returns credit-only orders entirely as credit", () => {
    expect(
      splitRefundTender({
        refundMinor: 10_000,
        cashMinor: 0,
        creditMinor: 10_500,
      }),
    ).toEqual({ creditBackMinor: 10_000, cashBackMinor: 0 });
  });

  it("splits a mixed order in proportion to how it was paid", () => {
    // Paid GH₵ 105: GH₵ 31.50 credit (30%) + GH₵ 73.50 cash. Refund GH₵ 100.
    expect(
      splitRefundTender({
        refundMinor: 10_000,
        cashMinor: 7350,
        creditMinor: 3150,
      }),
    ).toEqual({ creditBackMinor: 3000, cashBackMinor: 7000 });
  });

  it("never refunds more cash than was collected", () => {
    const split = splitRefundTender({
      refundMinor: 10_000,
      cashMinor: 100,
      creditMinor: 10_400,
    });
    expect(split.cashBackMinor).toBeLessThanOrEqual(100);
    expect(split.creditBackMinor + split.cashBackMinor).toBe(10_000);
  });

  it("caps the refund at what was paid", () => {
    expect(
      splitRefundTender({
        refundMinor: 99_999,
        cashMinor: 500,
        creditMinor: 500,
      }),
    ).toEqual({ creditBackMinor: 500, cashBackMinor: 500 });
  });
});
