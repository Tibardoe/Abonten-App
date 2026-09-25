import { describe, expect, it } from "vitest";
import { convertForDisplay, crossRate } from "./conversion";
import {
  currencyMinorFactor,
  currencyMinorUnits,
  getCurrency,
  isKnownCurrency,
} from "./currencies";
import { formatMajor, formatMinorDigits, formatMoney } from "./formatMoney";
import {
  add,
  allocate,
  compare,
  fromMajor,
  money,
  multiply,
  percentageBps,
  roundHalfAwayFromZero,
  subtract,
  sum,
  toMajor,
  toMajorString,
  tryFromMajor,
} from "./money";

describe("currencies", () => {
  it("knows the launch and target markets with their exponents", () => {
    expect(currencyMinorUnits("GHS")).toBe(2);
    expect(currencyMinorUnits("NGN")).toBe(2);
    expect(currencyMinorUnits("KES")).toBe(2);
    expect(currencyMinorUnits("GBP")).toBe(2);
    expect(currencyMinorUnits("USD")).toBe(2);
    expect(currencyMinorUnits("EUR")).toBe(2);
    expect(currencyMinorUnits("XOF")).toBe(0);
    expect(currencyMinorUnits("JPY")).toBe(0);
    expect(currencyMinorUnits("KWD")).toBe(3);
    expect(currencyMinorFactor("XOF")).toBe(1);
    expect(currencyMinorFactor("KWD")).toBe(1000);
  });

  it("normalises case and rejects unknown codes", () => {
    expect(getCurrency("ghs").code).toBe("GHS");
    expect(isKnownCurrency("ghs")).toBe(true);
    expect(isKnownCurrency("ABC")).toBe(false);
    expect(isKnownCurrency(null)).toBe(false);
    expect(() => getCurrency("ABC")).toThrow(/Unknown currency/);
  });
});

describe("rounding", () => {
  it("rounds half away from zero", () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(2.4999999999999996)).toBe(3);
    expect(roundHalfAwayFromZero(1.2000000000000002)).toBe(1);
    expect(roundHalfAwayFromZero(Number.NaN)).toBe(0);
  });
});

describe("major <-> minor", () => {
  it("converts by the currency exponent, exactly", () => {
    expect(fromMajor(25.2, "GHS")).toEqual({
      amountMinor: 2520,
      currency: "GHS",
    });
    expect(fromMajor("25.20", "GHS").amountMinor).toBe(2520);
    expect(fromMajor("1,500", "NGN").amountMinor).toBe(150000);
    expect(fromMajor(1500, "XOF").amountMinor).toBe(1500);
    expect(fromMajor("1.2345", "KWD").amountMinor).toBe(1235);
    expect(fromMajor(0.1 + 0.2, "USD").amountMinor).toBe(30);
    expect(fromMajor("-12.345", "GBP").amountMinor).toBe(-1235);
  });

  it("renders exact decimal strings for numeric columns", () => {
    expect(toMajorString(money(2520, "GHS"))).toBe("25.20");
    expect(toMajorString(money(5, "GHS"))).toBe("0.05");
    expect(toMajorString(money(-120, "GHS"))).toBe("-1.20");
    expect(toMajorString(money(1500, "XOF"))).toBe("1500");
    expect(toMajorString(money(1235, "KWD"))).toBe("1.235");
    expect(toMajor(money(2520, "GHS"))).toBe(25.2);
  });

  it("refuses malformed input", () => {
    expect(() => fromMajor("12.3.4", "GHS")).toThrow();
    expect(() => fromMajor("abc", "GHS")).toThrow();
    expect(tryFromMajor("abc", "GHS")).toBeNull();
    expect(tryFromMajor(undefined, "GHS")).toBeNull();
    expect(tryFromMajor("10", "GHS")?.amountMinor).toBe(1000);
  });
});

describe("arithmetic", () => {
  const ghs = (minor: number) => money(minor, "GHS");

  it("adds, subtracts and sums in one currency", () => {
    expect(add(ghs(100), ghs(250)).amountMinor).toBe(350);
    expect(subtract(ghs(100), ghs(250)).amountMinor).toBe(-150);
    expect(sum([ghs(1), ghs(2), ghs(3)], "GHS").amountMinor).toBe(6);
    expect(sum([], "GHS").amountMinor).toBe(0);
    expect(compare(ghs(1), ghs(2))).toBe(-1);
  });

  it("refuses to mix currencies", () => {
    expect(() => add(ghs(1), money(1, "NGN"))).toThrow(/Currency mismatch/);
  });

  it("applies a fee rate with one rounding, like the database", () => {
    // 5% of GHS 24.00 = 1.20, never 1.2000000000000002
    expect(multiply(ghs(2400), 0.05).amountMinor).toBe(120);
    expect(percentageBps(ghs(2400), 500).amountMinor).toBe(120);
    // 5% of GHS 0.10 = 0.005 -> rounds up to a pesewa
    expect(percentageBps(ghs(10), 500).amountMinor).toBe(1);
    // XOF has no minor unit: 5% of 1 001 CFA = 50.05 -> 50
    expect(percentageBps(money(1001, "XOF"), 500).amountMinor).toBe(50);
  });

  it("allocates without losing a minor unit", () => {
    const parts = allocate(ghs(1000), [1, 1, 1]);
    expect(parts.map((p) => p.amountMinor)).toEqual([334, 333, 333]);
    expect(parts.reduce((s, p) => s + p.amountMinor, 0)).toBe(1000);

    const uneven = allocate(ghs(101), [70, 30]);
    expect(uneven.map((p) => p.amountMinor)).toEqual([71, 30]);

    // Refund split cash vs credit, pro rata to what each paid.
    const refund = allocate(ghs(1500), [2000, 500]);
    expect(refund.map((p) => p.amountMinor)).toEqual([1200, 300]);

    expect(allocate(ghs(-7), [1, 1]).map((p) => p.amountMinor)).toEqual([
      -4, -3,
    ]);
    expect(allocate(ghs(9), [0, 0, 0]).map((p) => p.amountMinor)).toEqual([
      3, 3, 3,
    ]);
    expect(allocate(ghs(9), [])).toEqual([]);
  });
});

describe("formatMoney", () => {
  it("formats the launch and target currencies the way people write them", () => {
    expect(formatMoney(money(5000, "GHS"))).toBe("GH₵50.00");
    expect(formatMoney(money(5000, "GHS"), { trimZeroFraction: true })).toBe(
      "GH₵50",
    );
    expect(formatMoney(money(2500, "USD"))).toBe("$25.00");
    expect(formatMoney(money(3000, "EUR"))).toBe("€30.00");
    expect(formatMoney(money(2000, "GBP"))).toBe("£20.00");
    expect(formatMoney(money(2500000, "NGN"))).toBe("₦25,000.00");
    expect(formatMoney(money(150000, "KES"))).toBe("KSh 1,500.00");
    expect(formatMoney(money(1500, "XOF"))).toBe("CFA 1,500");
    expect(formatMoney(money(1235, "KWD"))).toBe("KD 1.235");
  });

  it("handles sign, code display and ambiguous symbols", () => {
    expect(formatMoney(money(-1240, "GHS"))).toBe("−GH₵12.40");
    expect(formatMoney(money(300, "GHS"), { signDisplay: "always" })).toBe(
      "+GH₵3.00",
    );
    expect(formatMoney(money(0, "GHS"), { signDisplay: "always" })).toBe(
      "GH₵0.00",
    );
    expect(formatMoney(money(2520, "GHS"), { display: "code" })).toBe(
      "GHS 25.20",
    );
    expect(formatMoney(money(2500, "USD"), { viewerCurrency: "CAD" })).toBe(
      "US$25.00",
    );
    expect(formatMoney(money(2500, "USD"), { viewerCurrency: "USD" })).toBe(
      "$25.00",
    );
    expect(formatMoney(money(2500, "USD"), { viewerCurrency: "GHS" })).toBe(
      "$25.00",
    );
  });

  it("follows the locale for digits", () => {
    expect(formatMinorDigits(2500000, "EUR", { locale: "de-DE" })).toBe(
      "25.000,00",
    );
    expect(formatMoney(money(2500000, "EUR"), { locale: "fr-FR" })).toMatch(
      /^€25\s000,00$/,
    );
  });

  it("formats major-unit column values and survives junk", () => {
    expect(formatMajor(25.2, "GHS")).toBe("GH₵25.20");
    expect(formatMajor("1500", "NGN")).toBe("₦1,500.00");
    expect(formatMajor(null, "GHS")).toBe("GH₵0.00");
    expect(formatMajor(Number.NaN, "GHS")).toBe("GH₵0.00");
    expect(formatMajor(24 * 0.05, "GHS")).toBe("GH₵1.20");
  });
});

describe("display conversion", () => {
  const table = {
    base: "USD",
    rates: { GHS: 15.5, GBP: 0.79, NGN: 1550 },
    asOf: "2026-09-24T10:00:00Z",
    source: "test",
  };
  const now = new Date("2026-09-24T12:00:00Z");

  it("converts through the base", () => {
    expect(crossRate(table, "GBP", "GHS")).toBeCloseTo(15.5 / 0.79, 6);
    expect(crossRate(table, "USD", "NGN")).toBe(1550);
    expect(crossRate(table, "GHS", "GHS")).toBe(1);
    expect(crossRate(table, "GHS", "KES")).toBeNull();
  });

  it("gives an approximate amount in the viewer's currency", () => {
    const out = convertForDisplay(money(10000, "GBP"), "GHS", table, { now });
    expect(out?.approx.currency).toBe("GHS");
    expect(out?.approx.amountMinor).toBe(196203);
    expect(out?.stale).toBe(false);
    expect(
      formatMoney(out?.approx ?? money(0, "GHS"), { trimZeroFraction: true }),
    ).toBe("GH₵1,962.03");
  });

  it("flags stale rates and refuses very old ones", () => {
    const later = new Date("2026-09-26T12:00:00Z");
    expect(
      convertForDisplay(money(100, "GBP"), "GHS", table, { now: later })?.stale,
    ).toBe(true);
    const muchLater = new Date("2026-10-10T12:00:00Z");
    expect(
      convertForDisplay(money(100, "GBP"), "GHS", table, { now: muchLater }),
    ).toBeNull();
  });

  it("never invents a rate", () => {
    expect(
      convertForDisplay(money(100, "GBP"), "KES", table, { now }),
    ).toBeNull();
    expect(convertForDisplay(money(100, "GBP"), "KES", null)).toBeNull();
    expect(
      convertForDisplay(money(100, "GBP"), "GBP", null)?.approx,
    ).toBeUndefined();
  });
});
