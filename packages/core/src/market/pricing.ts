// Order totals for a market: subtotal, discount, the customer-paid service
// fee and tax, in integer minor units of the order currency, with one
// rounding per line. Shared by the checkout preview (client), the payment
// preparation (server, authoritative) and the receipt.
//
// Tax follows the market's TaxConfig:
//   none       no tax line.
//   exclusive  tax is added on top of the ticket revenue (net of discount)
//              and shown as its own line; the organizer's price is ex-tax.
//   inclusive  the organizer's price already includes tax; the tax portion
//              is derived for the receipt and nothing is added.
// The service fee is charged on the ticket revenue net of discount, never
// on tax, and tax is never charged on the service fee. Legal review decides
// the rates; this is only the arithmetic.

import {
  type Money,
  add,
  floorAtZero,
  money,
  percentageBps,
  subtract,
  zero,
} from "../money/money";
import type { TaxConfig } from "./types";

export type OrderTotals = {
  subtotal: Money;
  discount: Money;
  /** Ticket revenue after discount — what the organizer earns. */
  net: Money;
  serviceFee: Money;
  /** Tax added on top (exclusive) — 0 for none/inclusive. */
  taxAdded: Money;
  /** Tax contained in `net` (inclusive) — 0 for none/exclusive. */
  taxIncluded: Money;
  total: Money;
  taxLabel: string;
  taxMode: TaxConfig["mode"];
};

export function computeOrderTotals(input: {
  subtotal: Money;
  discount?: Money | null;
  serviceFeeBps: number;
  tax?: TaxConfig | null;
}): OrderTotals {
  const currency = input.subtotal.currency;
  const discount = input.discount ?? zero(currency);
  const net = floorAtZero(subtract(input.subtotal, discount));
  const serviceFee =
    net.amountMinor > 0
      ? percentageBps(net, input.serviceFeeBps)
      : zero(currency);
  const tax = input.tax ?? { mode: "none" as const, rateBps: 0, label: "" };

  let taxAdded = zero(currency);
  let taxIncluded = zero(currency);
  if (tax.mode === "exclusive" && tax.rateBps > 0) {
    taxAdded = percentageBps(net, tax.rateBps);
  } else if (tax.mode === "inclusive" && tax.rateBps > 0) {
    // net = base × (1 + r)  ⇒  tax = net − net / (1 + r)
    const base = money(
      (net.amountMinor * 10_000) / (10_000 + tax.rateBps),
      currency,
    );
    taxIncluded = subtract(net, base);
  }

  const total = add(add(net, serviceFee), taxAdded);
  return {
    subtotal: input.subtotal,
    discount,
    net,
    serviceFee,
    taxAdded,
    taxIncluded,
    total,
    taxLabel: tax.label,
    taxMode: tax.mode,
  };
}

/** The service fee alone (what checkoutPricing's computeCheckoutFee did). */
export function serviceFeeFor(net: Money, serviceFeeBps: number): Money {
  return net.amountMinor > 0
    ? percentageBps(net, serviceFeeBps)
    : zero(net.currency);
}

/** 0.05 -> 500 bps, guarding float tails (0.05 * 10000 = 500.00000000000006). */
export function rateToBps(rate: number): number {
  return Math.round(rate * 10_000);
}
