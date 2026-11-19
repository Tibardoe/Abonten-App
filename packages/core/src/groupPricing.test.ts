import { describe, expect, it } from "vitest";
import {
  computeLineAmount,
  groupDiscountPercentFor,
  priceOrder,
  purchasesLeft,
} from "./checkoutPricing";
import {
  admitsProblem,
  groupDiscountTiersProblem,
  sortGroupDiscountTiers,
} from "./groupPricing";

const GHS = "GHS";

describe("priceOrder — ordinary tickets", () => {
  it("prices exactly like computeLineAmount when nothing is grouped", () => {
    const order = priceOrder(
      [
        { id: "a", purchases: 3, unitPrice: 33.33, currency: GHS },
        { id: "b", purchases: 2, unitPrice: 50, currency: GHS },
      ],
      { promo: { percent: 15, remainingUses: 4 } },
    );
    const a = computeLineAmount(3, 33.33, 15, 3, GHS);
    const b = computeLineAmount(2, 50, 15, 1, GHS);
    expect(order.lines[0]).toMatchObject({
      quantity: 3,
      discountedUnits: 3,
      discount: a.discount,
      amount: a.amount,
      groupDiscountPercent: null,
    });
    expect(order.lines[1]).toMatchObject({
      quantity: 2,
      discountedUnits: 1,
      discount: b.discount,
      amount: b.amount,
    });
    expect(order.promoApplied).toBe(true);
  });
});

describe("priceOrder — group tickets", () => {
  it("issues admits tickets per purchase at the purchase price", () => {
    const order = priceOrder([
      { id: "couple", purchases: 2, admits: 2, unitPrice: 500, currency: GHS },
    ]);
    expect(order.tickets).toBe(4);
    expect(order.lines[0]).toMatchObject({
      purchases: 2,
      admits: 2,
      quantity: 4,
      unitPrice: 500,
      discount: 0,
      amount: 1000,
    });
  });

  it("discounts a promo code per ticket, half a couple at a time", () => {
    // One use left: one of the couple's two tickets is discounted, so a
    // quarter of 500 x 20% ... = 500 / 2 x 20% = 50 off.
    const order = priceOrder(
      [
        {
          id: "couple",
          purchases: 1,
          admits: 2,
          unitPrice: 500,
          currency: GHS,
        },
      ],
      { promo: { percent: 20, remainingUses: 1 } },
    );
    expect(order.lines[0]).toMatchObject({
      discountedUnits: 1,
      discount: 50,
      amount: 450,
    });
  });

  it("rounds once per line, in the currency's minor units", () => {
    const order = priceOrder(
      [{ id: "table", purchases: 1, admits: 3, unitPrice: 100, currency: GHS }],
      { promo: { percent: 10, remainingUses: 1 } },
    );
    // 100 / 3 x 10% = 3.333... -> 3.33
    expect(order.lines[0].discount).toBe(3.33);
    expect(order.lines[0].amount).toBe(96.67);
  });
});

describe("priceOrder — group prices", () => {
  const tiers = [
    { minTickets: 10, percentOff: 10 },
    { minTickets: 20, percentOff: 15 },
  ];

  it("applies the best tier the whole order reaches, to every line", () => {
    const order = priceOrder(
      [
        { id: "regular", purchases: 8, unitPrice: 300, currency: GHS },
        {
          id: "couple",
          purchases: 1,
          admits: 2,
          unitPrice: 500,
          currency: GHS,
        },
      ],
      { groupTiers: tiers },
    );
    expect(order.tickets).toBe(10);
    expect(order.groupDiscountPercent).toBe(10);
    expect(order.lines[0]).toMatchObject({
      discount: 240,
      amount: 2160,
      groupDiscountPercent: 10,
    });
    expect(order.lines[1]).toMatchObject({
      discount: 50,
      amount: 450,
      groupDiscountPercent: 10,
    });
  });

  it("gives nothing below the smallest tier", () => {
    const order = priceOrder(
      [{ id: "regular", purchases: 9, unitPrice: 300, currency: GHS }],
      { groupTiers: tiers },
    );
    expect(order.groupDiscountPercent).toBe(0);
    expect(order.lines[0]).toMatchObject({
      discount: 0,
      amount: 2700,
      groupDiscountPercent: null,
    });
  });

  it("never adds a promo code to a group price: the larger wins per ticket", () => {
    // Code 25% beats group 10%, but only 4 uses are left: 4 tickets at
    // 25%, the other 8 at the group's 10%.
    const better = priceOrder(
      [{ id: "regular", purchases: 12, unitPrice: 100, currency: GHS }],
      { promo: { percent: 25, remainingUses: 4 }, groupTiers: tiers },
    );
    expect(better.promoApplied).toBe(true);
    expect(better.lines[0]).toMatchObject({
      discountedUnits: 4,
      discount: 100 + 80,
      amount: 1200 - 180,
      groupDiscountPercent: 10,
    });

    // A code no better than the group price is not used at all.
    const worse = priceOrder(
      [{ id: "regular", purchases: 12, unitPrice: 100, currency: GHS }],
      { promo: { percent: 10, remainingUses: null }, groupTiers: tiers },
    );
    expect(worse.promoApplied).toBe(false);
    expect(worse.lines[0]).toMatchObject({
      discountedUnits: 0,
      discount: 120,
      amount: 1080,
    });
  });

  it("picks the highest tier reached", () => {
    expect(groupDiscountPercentFor(tiers, 25)).toBe(15);
    expect(groupDiscountPercentFor(tiers, 10)).toBe(10);
    expect(groupDiscountPercentFor(null, 100)).toBe(0);
  });
});

describe("purchasesLeft", () => {
  it("counts whole purchases in the places left", () => {
    expect(purchasesLeft(5, 2)).toBe(2);
    expect(purchasesLeft(5, 1)).toBe(5);
    expect(purchasesLeft(null, 2)).toBeNull();
    expect(purchasesLeft(-1, 2)).toBe(0);
  });
});

describe("group pricing rules", () => {
  it("checks how many people a ticket admits", () => {
    expect(admitsProblem(2)).toBeNull();
    expect(admitsProblem(0)).toBe("admits_range");
    expect(admitsProblem(21)).toBe("admits_range");
    expect(admitsProblem(1.5)).toBe("admits_range");
    expect(admitsProblem(2, true)).toBe("free_admits");
  });

  it("checks group price tiers", () => {
    expect(
      groupDiscountTiersProblem([
        { minTickets: 10, percentOff: 10 },
        { minTickets: 20, percentOff: 15 },
      ]),
    ).toBeNull();
    expect(
      groupDiscountTiersProblem([
        { minTickets: 2, percentOff: 5 },
        { minTickets: 3, percentOff: 6 },
        { minTickets: 4, percentOff: 7 },
        { minTickets: 5, percentOff: 8 },
      ]),
    ).toBe("too_many_tiers");
    expect(groupDiscountTiersProblem([{ minTickets: 1, percentOff: 5 }])).toBe(
      "tier_range",
    );
    expect(groupDiscountTiersProblem([{ minTickets: 5, percentOff: 95 }])).toBe(
      "tier_range",
    );
    expect(
      groupDiscountTiersProblem([
        { minTickets: 5, percentOff: 5 },
        { minTickets: 5, percentOff: 10 },
      ]),
    ).toBe("tier_duplicate");
    expect(
      groupDiscountTiersProblem([
        { minTickets: 20, percentOff: 10 },
        { minTickets: 10, percentOff: 15 },
      ]),
    ).toBe("tier_not_better");
    expect(
      sortGroupDiscountTiers([
        { minTickets: 20, percentOff: 15 },
        { minTickets: 10, percentOff: 10 },
      ]).map((t) => t.minTickets),
    ).toEqual([10, 20]);
  });
});
