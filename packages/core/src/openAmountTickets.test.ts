import { describe, expect, it } from "vitest";
import { computeCheckoutFee, priceOrder } from "./checkoutPricing";
import { t, tFr } from "./i18n/testTranslator";
import {
  checkedInTicketLines,
  chosenAmountProblem,
  isOpenAmountType,
  openAmountQuickPicks,
  openAmountRangeLabel,
  openAmountRangeOf,
  openAmountRangeProblem,
  openAmountTypeProblem,
  parseChosenAmount,
  promoCodeEntryShown,
} from "./openAmountTickets";
import { FREE_TICKET_TYPE } from "./ticketTiers";

const GHS = "GHS";
const XOF = "XOF";
const credits = { minAmount: 50, maxAmount: 1000, amountStep: 10 };

describe("openAmountRangeProblem", () => {
  it("accepts a range the maximum ends on a step of", () => {
    expect(openAmountRangeProblem(credits, GHS)).toBeNull();
    expect(
      openAmountRangeProblem(
        { minAmount: 0.5, maxAmount: 2, amountStep: 0.5 },
        GHS,
      ),
    ).toBeNull();
    // One amount only (a fixed deposit through the same path).
    expect(
      openAmountRangeProblem(
        { minAmount: 200, maxAmount: 200, amountStep: 1 },
        GHS,
      ),
    ).toBeNull();
  });

  it("refuses a missing, empty or upside-down range", () => {
    expect(openAmountRangeProblem(null, GHS)).toBe("range_missing");
    expect(openAmountRangeProblem({ minAmount: 50, maxAmount: 100 }, GHS)).toBe(
      "range_missing",
    );
    expect(openAmountRangeProblem({ ...credits, minAmount: 0 }, GHS)).toBe(
      "min_not_positive",
    );
    expect(openAmountRangeProblem({ ...credits, amountStep: 0 }, GHS)).toBe(
      "step_not_positive",
    );
    expect(openAmountRangeProblem({ ...credits, maxAmount: 40 }, GHS)).toBe(
      "max_below_min",
    );
  });

  it("counts steps in the currency's minor units", () => {
    // 0.1 + 0.2 is not 0.3 in floating point; in pesewas it is.
    expect(
      openAmountRangeProblem(
        { minAmount: 0.1, maxAmount: 0.3, amountStep: 0.1 },
        GHS,
      ),
    ).toBeNull();
    expect(openAmountRangeProblem({ ...credits, maxAmount: 995 }, GHS)).toBe(
      "step_misaligned",
    );
    expect(openAmountRangeProblem({ ...credits, minAmount: 50.005 }, GHS)).toBe(
      "too_precise",
    );
    // The franc has no decimals.
    expect(
      openAmountRangeProblem(
        { minAmount: 500, maxAmount: 1000.5, amountStep: 0.5 },
        XOF,
      ),
    ).toBe("too_precise");
  });
});

describe("openAmountTypeProblem", () => {
  const base = {
    amountMode: "open" as const,
    minAmount: 50,
    maxAmount: 1000,
    amountStep: 10,
  };
  const input = { currency: GHS, freeEvent: false };

  it("needs nothing from a fixed type", () => {
    expect(openAmountTypeProblem({ amountMode: "fixed" }, input)).toBeNull();
    expect(openAmountTypeProblem({}, input)).toBeNull();
  });

  it("refuses an open type that is also a group, a pass or free", () => {
    expect(openAmountTypeProblem(base, input)).toBeNull();
    expect(openAmountTypeProblem({ ...base, admits: 2 }, input)).toBe("admits");
    expect(openAmountTypeProblem({ ...base, passShows: 3 }, input)).toBe(
      "pass",
    );
    expect(
      openAmountTypeProblem(base, { currency: GHS, freeEvent: true }),
    ).toBe("free_event");
    expect(openAmountTypeProblem({ ...base, maxAmount: 995 }, input)).toBe(
      "step_misaligned",
    );
  });
});

describe("chosenAmountProblem", () => {
  it("accepts amounts on the steps within the range", () => {
    expect(chosenAmountProblem(50, credits, GHS)).toBeNull();
    expect(chosenAmountProblem(150, credits, GHS)).toBeNull();
    expect(chosenAmountProblem("1000", credits, GHS)).toBeNull();
    expect(chosenAmountProblem(" 150.00 ", credits, GHS)).toBeNull();
  });

  it("says what is wrong with the others", () => {
    expect(chosenAmountProblem("", credits, GHS)).toBe("missing");
    expect(chosenAmountProblem("abc", credits, GHS)).toBe("missing");
    expect(chosenAmountProblem(null, credits, GHS)).toBe("missing");
    expect(chosenAmountProblem(40, credits, GHS)).toBe("below_min");
    expect(chosenAmountProblem(1010, credits, GHS)).toBe("above_max");
    expect(chosenAmountProblem(155, credits, GHS)).toBe("off_step");
    expect(chosenAmountProblem("150.005", credits, GHS)).toBe("off_step");
  });

  it("parses what was typed", () => {
    expect(parseChosenAmount("150", GHS)).toBe(150);
    expect(parseChosenAmount("150.5", GHS)).toBe(150.5);
    expect(parseChosenAmount("", GHS)).toBeNull();
  });
});

describe("openAmountQuickPicks", () => {
  it("offers the minimum and multiples of it on the steps", () => {
    expect(openAmountQuickPicks(credits, GHS)).toEqual([50, 100, 250, 500]);
  });

  it("keeps within the maximum and adds it when there is room", () => {
    expect(
      openAmountQuickPicks(
        { minAmount: 20, maxAmount: 62, amountStep: 7 },
        GHS,
      ),
    ).toEqual([20, 41, 62]);
    expect(
      openAmountQuickPicks(
        { minAmount: 200, maxAmount: 200, amountStep: 1 },
        GHS,
      ),
    ).toEqual([200]);
  });

  it("offers nothing for a range that cannot be saved", () => {
    expect(
      openAmountQuickPicks({ minAmount: 0, maxAmount: 10, amountStep: 1 }, GHS),
    ).toEqual([]);
  });
});

describe("rows", () => {
  it("reads a ticket type row", () => {
    expect(isOpenAmountType({ amount_mode: "open" })).toBe(true);
    expect(isOpenAmountType({ amount_mode: "fixed" })).toBe(false);
    expect(isOpenAmountType({})).toBe(false);
    expect(
      openAmountRangeOf({
        amount_mode: "open",
        min_amount: "50",
        max_amount: "1000",
        amount_step: "10",
      }),
    ).toEqual(credits);
    expect(openAmountRangeOf({ amount_mode: "fixed" })).toBeNull();
  });
});

describe("priceOrder — open amounts", () => {
  it("prices an open line at the amount chosen, one ticket", () => {
    const order = priceOrder([
      {
        id: "credits",
        purchases: 3,
        unitPrice: 50,
        currency: GHS,
        amountMode: "open",
        chosenAmount: 150,
      },
    ]);
    expect(order.lines[0]).toMatchObject({
      purchases: 1,
      admits: 1,
      quantity: 1,
      unitPrice: 150,
      discount: 0,
      discountedUnits: 0,
      groupDiscountPercent: null,
      amount: 150,
      openAmount: true,
    });
    expect(order.tickets).toBe(1);
    expect(order.discountableTickets).toBe(0);
  });

  it("never discounts an open line with a promo code or a group price", () => {
    const order = priceOrder(
      [
        {
          id: "credits",
          purchases: 1,
          unitPrice: 50,
          currency: GHS,
          amountMode: "open",
          chosenAmount: 200,
        },
        { id: "entry", purchases: 2, unitPrice: 100, currency: GHS },
      ],
      {
        promo: { percent: 10, remainingUses: 1 },
        groupTiers: [{ minTickets: 3, percentOff: 20 }],
      },
    );
    // The group price counts the two entry tickets only: not reached.
    expect(order.groupDiscountPercent).toBe(0);
    expect(order.discountableTickets).toBe(2);
    const [credits, entry] = order.lines;
    expect(credits).toMatchObject({ amount: 200, discount: 0 });
    // The code's one remaining use goes to an entry ticket, not the credits.
    expect(entry).toMatchObject({ discountedUnits: 1, discount: 10 });
    expect(order.promoApplied).toBe(true);
  });

  it("leaves the code unused when only open lines are bought", () => {
    const order = priceOrder(
      [
        {
          id: "credits",
          purchases: 1,
          unitPrice: 50,
          currency: GHS,
          amountMode: "open",
          chosenAmount: 75,
        },
      ],
      { promo: { percent: 50, remainingUses: null } },
    );
    expect(order.promoApplied).toBe(false);
    expect(order.lines[0].amount).toBe(75);
  });

  it("adds the service fee on top of the amount", () => {
    const order = priceOrder([
      {
        id: "credits",
        purchases: 1,
        unitPrice: 50,
        currency: GHS,
        amountMode: "open",
        chosenAmount: 150,
      },
    ]);
    expect(computeCheckoutFee(order.lines[0].amount, 0.05, GHS)).toBe(7.5);
  });
});

describe("openAmountRangeLabel", () => {
  it("shows both ends of the range in one sentence", () => {
    expect(
      openAmountRangeLabel(
        t,
        { minAmount: 20, maxAmount: 1000, amountStep: 5 },
        GHS,
        "en",
      ),
    ).toBe("GH₵20 to GH₵1,000");
  });

  it("shows one amount when the range holds one", () => {
    expect(
      openAmountRangeLabel(
        t,
        { minAmount: 200, maxAmount: 200, amountStep: 1 },
        GHS,
        "en",
      ),
    ).toBe("GH₵200");
  });

  it("speaks the reader's language", () => {
    const label = openAmountRangeLabel(tFr, credits, GHS, "fr");
    expect(label).toContain(" à ");
    expect(label).not.toContain(" to ");
  });
});

describe("promoCodeEntryShown", () => {
  const fixed = { open: false };
  const open = { open: true };

  it("is hidden when every line picked is an amount the buyer chose", () => {
    expect(promoCodeEntryShown([open])).toBe(false);
    expect(promoCodeEntryShown([open, open], [open, fixed])).toBe(false);
  });

  it("stays when any fixed-price line is picked", () => {
    expect(promoCodeEntryShown([open, fixed])).toBe(true);
    expect(promoCodeEntryShown([fixed])).toBe(true);
  });

  it("before anything is picked, follows the types on offer", () => {
    expect(promoCodeEntryShown([], [open, fixed])).toBe(true);
    expect(promoCodeEntryShown([], [open])).toBe(false);
    // Nothing known yet: as before, the entry shows.
    expect(promoCodeEntryShown([], [])).toBe(true);
    expect(promoCodeEntryShown([])).toBe(true);
  });
});

describe("checkedInTicketLines (what the door shows)", () => {
  it("shows the amount paid for a ticket whose amount the buyer chose", () => {
    const lines = checkedInTicketLines(
      t,
      {
        type: "RIDE CREDITS",
        note: "Loaded on your card at the gate",
        paidAmount: { amount: 150, currency: GHS },
      },
      "en",
    );
    expect(lines).toEqual({
      paid: "Paid GH₵150.00",
      type: "RIDE CREDITS",
      note: "Loaded on your card at the gate",
    });
  });

  it("says it in the reader's language", () => {
    const lines = checkedInTicketLines(
      tFr,
      { type: null, note: null, paidAmount: { amount: 150, currency: GHS } },
      "fr",
    );
    expect(lines.paid).toMatch(/^Payé /);
    expect(lines.paid).toContain("150");
  });

  it("shows no amount for a fixed-price ticket", () => {
    expect(
      checkedInTicketLines(
        t,
        { type: "VIP", note: null, paidAmount: null },
        "en",
      ),
    ).toEqual({ paid: null, type: "VIP", note: null });
  });

  it("words the FREE tier and skips an empty note", () => {
    expect(
      checkedInTicketLines(
        t,
        { type: FREE_TICKET_TYPE, note: "  ", paidAmount: null },
        "en",
      ),
    ).toEqual({ paid: null, type: "Free", note: null });
  });
});
