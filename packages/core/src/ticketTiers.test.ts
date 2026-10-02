import { describe, expect, it } from "vitest";
import { t } from "./i18n/testTranslator";
import {
  hasFreeRegistration,
  paidTierProblem,
  ticketTierProblemMessage,
} from "./ticketTiers";

describe("hasFreeRegistration", () => {
  it("is true only when the FREE tier exists", () => {
    expect(hasFreeRegistration([{ type: "FREE" }])).toBe(true);
    expect(hasFreeRegistration([{ type: "SINGLE TICKET" }])).toBe(false);
    expect(hasFreeRegistration([])).toBe(false);
  });

  it("does not treat a 0-priced tier under another name as free registration", () => {
    // issue_free_ticket looks the tier up by name, so a tier priced 0 under
    // another name would be refused; only the name is read here.
    expect(hasFreeRegistration([{ type: "Early bird" }])).toBe(false);
  });
});

describe("paidTierProblem", () => {
  it("accepts a priced, named tier", () => {
    expect(paidTierProblem({ type: "VIP", price: 150 })).toBeNull();
    expect(paidTierProblem({ price: 0.5 })).toBeNull();
  });

  it("refuses a zero, negative or non-numeric price", () => {
    expect(paidTierProblem({ type: "VIP", price: 0 })).toBe("paid_needs_price");
    expect(paidTierProblem({ type: "VIP", price: -1 })).toBe(
      "paid_needs_price",
    );
    expect(paidTierProblem({ type: "VIP", price: Number.NaN })).toBe(
      "paid_needs_price",
    );
    expect(ticketTierProblemMessage(t, "paid_needs_price")).toMatch(
      /greater than zero/,
    );
  });

  it("refuses the reserved FREE name in any case", () => {
    expect(paidTierProblem({ type: " free ", price: 20 })).toBe(
      "free_reserved",
    );
    expect(paidTierProblem({ type: "FREE", price: 20 })).toBe("free_reserved");
    expect(ticketTierProblemMessage(t, "free_reserved")).toMatch(/reserved/);
  });
});
