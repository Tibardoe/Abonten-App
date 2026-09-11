import { describe, expect, it } from "vitest";
import { allocateCredit, apportionCredit } from "./creditAllocation";

const base = {
  orderTotalMinor: 5000,
  minCashChargeMinor: 100,
  allowFullCredit: true,
};

describe("allocateCredit", () => {
  it("pays the whole order with credit when the balance covers it", () => {
    expect(allocateCredit({ ...base, spendableMinor: 8000 })).toEqual({
      creditMinor: 5000,
      cashMinor: 0,
      creditOnly: true,
    });
  });

  it("leaves at least the minimum cash charge on a part-credit order", () => {
    expect(allocateCredit({ ...base, spendableMinor: 4950 })).toEqual({
      creditMinor: 4900,
      cashMinor: 100,
      creditOnly: false,
    });
  });

  it("uses the whole balance when it's comfortably below the total", () => {
    expect(allocateCredit({ ...base, spendableMinor: 1240 })).toEqual({
      creditMinor: 1240,
      cashMinor: 3760,
      creditOnly: false,
    });
  });

  it("never pays the whole order when full-credit orders are off", () => {
    expect(
      allocateCredit({ ...base, spendableMinor: 8000, allowFullCredit: false }),
    ).toEqual({ creditMinor: 4900, cashMinor: 100, creditOnly: false });
  });

  it("respects the maximum credit share", () => {
    expect(
      allocateCredit({ ...base, spendableMinor: 8000, maxShareBps: 5000 }),
    ).toEqual({ creditMinor: 2500, cashMinor: 2500, creditOnly: false });
  });

  it("applies nothing when there is no credit or no total", () => {
    expect(allocateCredit({ ...base, spendableMinor: 0 })).toEqual({
      creditMinor: 0,
      cashMinor: 5000,
      creditOnly: false,
    });
    expect(
      allocateCredit({ ...base, orderTotalMinor: 0, spendableMinor: 500 }),
    ).toEqual({ creditMinor: 0, cashMinor: 0, creditOnly: false });
  });

  it("applies nothing when the order is below the minimum cash charge and credit can't cover it", () => {
    expect(
      allocateCredit({ ...base, orderTotalMinor: 80, spendableMinor: 50 }),
    ).toEqual({ creditMinor: 0, cashMinor: 80, creditOnly: false });
  });
});

describe("apportionCredit", () => {
  it("splits credit pro rata and gives the rounding to the largest part", () => {
    expect(apportionCredit(1000, [2100, 5250, 1050])).toEqual([250, 625, 125]);
    const odd = apportionCredit(1001, [3000, 3000, 3000]);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(1001);
    expect(odd).toEqual([334, 334, 333]);
  });

  it("never gives a part more than its own total", () => {
    expect(apportionCredit(10_000, [300, 700])).toEqual([300, 700]);
  });

  it("returns zeros when there is nothing to split", () => {
    expect(apportionCredit(0, [100, 200])).toEqual([0, 0]);
    expect(apportionCredit(500, [0, 0])).toEqual([0, 0]);
  });
});
