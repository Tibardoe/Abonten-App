import { describe, expect, it } from "vitest";
import { computeRateReward, proRataMinor } from "./rewardMath";

// The launch rule: 1% of ticket revenue, capped at 35% of the sale's net
// platform revenue. On a GH₵ 100 ticket (10000 pesewas) the customer pays
// 105, Paystack keeps ~2.05, Abonten nets ~2.95 (295 pesewas).
const launch = { rateBps: 100, netShareCapBps: 3500, minBasisMinor: 2000 };

describe("computeRateReward", () => {
  it("pays 1% of a GH₵ 100 ticket when the net cap is not binding", () => {
    expect(
      computeRateReward({ ...launch, basisMinor: 10000, netRevenueMinor: 295 }),
    ).toEqual({ amountMinor: 100, limitedBy: "rate" });
  });

  it("caps at 35% of net revenue when processing ate most of the fee", () => {
    // Net revenue only GH₵ 2.00 -> cap is 70 pesewas, below the 1% (100).
    expect(
      computeRateReward({ ...launch, basisMinor: 10000, netRevenueMinor: 200 }),
    ).toEqual({ amountMinor: 70, limitedBy: "net_share_cap" });
  });

  it("pays nothing below the minimum order", () => {
    expect(
      computeRateReward({ ...launch, basisMinor: 1999, netRevenueMinor: 59 }),
    ).toEqual({ amountMinor: 0, limitedBy: "min_basis" });
  });

  it("pays nothing when the sale produced no net revenue", () => {
    expect(
      computeRateReward({ ...launch, basisMinor: 10000, netRevenueMinor: 0 }),
    ).toEqual({ amountMinor: 0, limitedBy: "no_net_revenue" });
    expect(
      computeRateReward({ ...launch, basisMinor: 10000, netRevenueMinor: -40 }),
    ).toEqual({ amountMinor: 0, limitedBy: "no_net_revenue" });
  });

  it("respects the remaining per-period cap", () => {
    expect(
      computeRateReward({
        ...launch,
        basisMinor: 10000,
        netRevenueMinor: 295,
        remainingCapMinor: 40,
      }),
    ).toEqual({ amountMinor: 40, limitedBy: "remaining_cap" });
  });

  it("applies a campaign multiplier but never beyond the net cap", () => {
    // 1.5x of 1% = 150, but the 35% net cap on 295 is 103.
    expect(
      computeRateReward({
        ...launch,
        basisMinor: 10000,
        netRevenueMinor: 295,
        multiplierBps: 15000,
      }),
    ).toEqual({ amountMinor: 103, limitedBy: "net_share_cap" });
  });

  it("always rounds down to the pesewa", () => {
    // 1% of GH₵ 84.27 = 84.27 pesewas -> 84.
    expect(
      computeRateReward({ ...launch, basisMinor: 8427, netRevenueMinor: 249 })
        .amountMinor,
    ).toBe(84);
  });
});

describe("proRataMinor", () => {
  it("returns the full amount when every unit survives", () => {
    expect(proRataMinor(300, 3, 3)).toBe(300);
  });

  it("scales down and rounds down when some units are cancelled", () => {
    expect(proRataMinor(100, 1, 3)).toBe(33);
    expect(proRataMinor(100, 2, 3)).toBe(66);
  });

  it("returns 0 for nothing surviving or bad input", () => {
    expect(proRataMinor(100, 0, 3)).toBe(0);
    expect(proRataMinor(100, 1, 0)).toBe(0);
    expect(proRataMinor(-5, 1, 1)).toBe(0);
  });
});
