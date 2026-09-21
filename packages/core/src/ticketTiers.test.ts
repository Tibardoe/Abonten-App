import { describe, expect, it } from "vitest";
import { hasFreeRegistration, paidTierProblem } from "./ticketTiers";

describe("hasFreeRegistration", () => {
  it("is true only when the FREE tier exists", () => {
    expect(hasFreeRegistration([{ type: "FREE", price: 0 }])).toBe(true);
    expect(hasFreeRegistration([{ type: "SINGLE TICKET", price: 50 }])).toBe(
      false,
    );
    expect(hasFreeRegistration([])).toBe(false);
  });

  it("does not treat a 0-priced tier under another name as free registration", () => {
    // issue_free_ticket looks the tier up by name, so this would be refused.
    expect(hasFreeRegistration([{ type: "Early bird", price: 0 }])).toBe(false);
  });
});

describe("paidTierProblem", () => {
  it("accepts a priced, named tier", () => {
    expect(paidTierProblem({ type: "VIP", price: 150 })).toBeNull();
    expect(paidTierProblem({ price: 0.5 })).toBeNull();
  });

  it("refuses a zero, negative or non-numeric price", () => {
    expect(paidTierProblem({ type: "VIP", price: 0 })).toMatch(
      /greater than zero/,
    );
    expect(paidTierProblem({ type: "VIP", price: -1 })).toMatch(
      /greater than zero/,
    );
    expect(paidTierProblem({ type: "VIP", price: Number.NaN })).toMatch(
      /greater than zero/,
    );
  });

  it("refuses the reserved FREE name in any case", () => {
    expect(paidTierProblem({ type: " free ", price: 20 })).toMatch(/reserved/);
    expect(paidTierProblem({ type: "FREE", price: 20 })).toMatch(/reserved/);
  });
});
