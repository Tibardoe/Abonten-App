import { describe, expect, it } from "vitest";
import {
  MAX_TICKETS_PER_ORDER,
  MAX_TICKETS_PER_TICKET_TYPE,
  validateCheckoutQuantities,
} from "./checkoutLimits";
import { t } from "./i18n/testTranslator";

describe("validateCheckoutQuantities", () => {
  it("rejects an empty (all-zero) order", () => {
    const result = validateCheckoutQuantities(t, { a: 0, b: 0 });
    expect(result.ok).toBe(false);
  });

  it("accepts a normal order within both ceilings", () => {
    const result = validateCheckoutQuantities(t, { a: 2, b: 3 });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a single line over the per-ticket-type ceiling (DOS-001)", () => {
    const result = validateCheckoutQuantities(t, {
      a: MAX_TICKETS_PER_TICKET_TYPE + 1,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a total over the per-order ceiling even split across many lines", () => {
    const quantities: Record<string, number> = {};
    // Each line individually legal, but the sum exceeds the order cap.
    const perLine = MAX_TICKETS_PER_TICKET_TYPE;
    const linesNeeded = Math.ceil((MAX_TICKETS_PER_ORDER + 1) / perLine);
    for (let i = 0; i < linesNeeded; i++) {
      quantities[`type-${i}`] = perLine;
    }
    const result = validateCheckoutQuantities(t, quantities);
    expect(result.ok).toBe(false);
  });

  it("ignores zero-quantity lines when summing the total", () => {
    const result = validateCheckoutQuantities(t, { a: 1, b: 0, c: 0 });
    expect(result).toEqual({ ok: true });
  });
});
