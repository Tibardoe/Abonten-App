import type { Database } from "@abonten/types/database.types";
// Shared server-side logic for turning a set of selected pending checkout
// sessions into an authoritative payment summary — reused by
// prepareMultiCheckoutPayment.ts (read-only preview) and
// createMultiCheckoutPaymentAttempt.ts (the write path). Deliberately NOT a
// "use server" Server Action — see ticketInventory.ts/promoUsage.ts for why:
// it accepts an arbitrary userId with no session binding of its own, so it
// must only ever be reached through actions that already resolved userId
// from the caller's own session. Never trusts client-supplied prices/totals:
// every number here comes from the already-authoritative ticket_checkout
// rows (locked in at checkout creation / quantity-update time), re-read
// fresh on every call after self-healing expiry.
//
// Money: totals are computed in integer minor units of the EVENT's currency
// (every session in one payment shares it) with the market's service fee and
// tax rules, then handed back as major-unit numbers for the envelope the
// clients already read. One order never mixes currencies or markets: paying
// for a London event and an Accra event together is refused.

import { computeOrderTotals, rateToBps } from "@abonten/core/market/pricing";
import {
  type Money,
  add,
  fromMajor,
  toMajor,
  zero,
} from "@abonten/core/money/money";
import { getMarketOrDefault } from "@abonten/services/markets/marketConfig";
import { getActiveServiceFeeRate } from "@abonten/services/platform/platformFee";
import type { SupabaseClient } from "@supabase/supabase-js";

type CheckoutRow = {
  checkout_session_id: string;
  total_price: number;
  discount: number;
  event_id: string;
  event: { title: string; currency: string; country_code: string } | null;
};

export type PreparedCheckoutSession = {
  checkoutSessionId: string;
  eventId: string;
  eventTitle: string;
  subtotal: number;
  discount: number;
  fee: number;
  /** Tax added on top (exclusive-tax markets); 0 otherwise. */
  tax: number;
  total: number;
  /** Integer minor units, for the money paths. */
  totalMinor: number;
  taxMinor: number;
};

export type PreparedCheckoutPayment = {
  validSessions: PreparedCheckoutSession[];
  invalidSessionIds: string[];
  grandTotal: number;
  grandTotalMinor: number;
  currency: string;
  countryCode: string;
  serviceFeeBps: number;
  taxLabel: string;
  /** Set when the selected sessions span more than one currency/market. */
  mixedMarkets: boolean;
};

export class MixedMarketCheckoutError extends Error {
  constructor() {
    super("The selected checkouts belong to different markets or currencies");
    this.name = "MixedMarketCheckoutError";
  }
}

/**
 * Re-reads the given checkout sessions fresh (after self-healing expiry),
 * scoped to the given user, and computes what's actually owed right now.
 * Any requested session id that no longer has pending rows (expired,
 * already paid elsewhere, or never belonged to this user) is reported back
 * in invalidSessionIds instead of silently dropped.
 */
export async function prepareCheckoutPayment(
  userId: string,
  checkoutSessionIds: string[],
  client: SupabaseClient<Database>,
): Promise<PreparedCheckoutPayment> {
  const supabase = client;
  const uniqueIds = Array.from(new Set(checkoutSessionIds));

  await supabase.rpc("expire_stale_ticket_checkouts");

  const { data, error } = await supabase
    .from("ticket_checkout")
    .select(
      "checkout_session_id, total_price, discount, event_id, event:event_id(title, currency, country_code)",
    )
    .in("checkout_session_id", uniqueIds)
    .eq("user_id", userId)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed fetching checkout sessions: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as CheckoutRow[];

  // The order's market and currency come from its events. A basket that
  // mixes them is refused before any money maths.
  const currencies = new Set<string>();
  const countries = new Set<string>();
  for (const row of rows) {
    if (row.event?.currency) currencies.add(row.event.currency.toUpperCase());
    if (row.event?.country_code)
      countries.add(row.event.country_code.toUpperCase());
  }
  const mixedMarkets = currencies.size > 1 || countries.size > 1;
  if (mixedMarkets) throw new MixedMarketCheckoutError();

  const market = await getMarketOrDefault([...countries][0] ?? null);
  const currency = [...currencies][0] ?? market.defaultCurrency;
  const feeRate =
    market.fees.serviceFeeBps != null
      ? market.fees.serviceFeeBps / 10_000
      : await getActiveServiceFeeRate(supabase, currency, market.countryCode);
  const serviceFeeBps = rateToBps(feeRate);

  type Acc = {
    eventId: string;
    eventTitle: string;
    subtotal: Money;
    discount: Money;
    net: Money;
  };
  const sessionsById = new Map<string, Acc>();

  for (const row of rows) {
    let acc = sessionsById.get(row.checkout_session_id);
    if (!acc) {
      acc = {
        eventId: row.event_id,
        eventTitle: row.event?.title ?? "",
        subtotal: zero(currency),
        discount: zero(currency),
        net: zero(currency),
      };
      sessionsById.set(row.checkout_session_id, acc);
    }
    const net = fromMajor(Number(row.total_price), currency);
    const discount = fromMajor(Number(row.discount), currency);
    acc.subtotal = add(acc.subtotal, add(net, discount));
    acc.discount = add(acc.discount, discount);
    acc.net = add(acc.net, net);
  }

  const validSessions: PreparedCheckoutSession[] = [];
  let grand = zero(currency);
  for (const [checkoutSessionId, acc] of sessionsById) {
    // The checkout rows already carry the discounted total (`total_price`),
    // so the fee and tax are computed on that net figure directly.
    const totals = computeOrderTotals({
      subtotal: acc.net,
      discount: null,
      serviceFeeBps,
      tax: market.tax,
    });
    grand = add(grand, totals.total);
    validSessions.push({
      checkoutSessionId,
      eventId: acc.eventId,
      eventTitle: acc.eventTitle,
      subtotal: toMajor(acc.subtotal),
      discount: toMajor(acc.discount),
      fee: toMajor(totals.serviceFee),
      tax: toMajor(totals.taxAdded),
      total: toMajor(totals.total),
      totalMinor: totals.total.amountMinor,
      taxMinor: totals.taxAdded.amountMinor,
    });
  }

  const invalidSessionIds = uniqueIds.filter((id) => !sessionsById.has(id));

  return {
    validSessions,
    invalidSessionIds,
    grandTotal: toMajor(grand),
    grandTotalMinor: grand.amountMinor,
    currency,
    countryCode: market.countryCode,
    serviceFeeBps,
    taxLabel: market.tax.mode === "exclusive" ? market.tax.label : "",
    mixedMarkets: false,
  };
}
