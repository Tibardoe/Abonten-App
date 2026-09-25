// The viewer's locale context — what every screen needs to feel local:
// which market they are in, what currency to show estimates in, what
// unit, zone and locale to format with. Resolved once per request (web)
// or per session (app) from, in order of trust:
//   1. the signed-in person's saved preferences,
//   2. the country of the area they are browsing,
//   3. the country the request came from (IP header / device region),
//   4. the default market.
// Only OPEN markets can be resolved to; a person in a country Abonten has
// not launched in browses the default market with their own display
// currency if it is known.

import type { DistanceUnit } from "../units/distance";
import type { PublicMarket } from "./types";
import { isMarketOpen } from "./types";

export type LocaleContext = {
  /** The market whose configuration applies (payment methods, tax…). */
  marketCountry: string;
  /** Where the viewer physically is, when known (may not be a market). */
  viewerCountry: string | null;
  /** The currency estimates are shown in. */
  displayCurrency: string;
  locale: string;
  distanceUnit: DistanceUnit;
  /** The viewer's own zone, for "your time" hints. */
  timeZone: string;
  /** How the market was chosen — for debugging and analytics. */
  source: "preference" | "browsing" | "request" | "default";
};

export type LocaleContextInput = {
  markets: readonly PublicMarket[];
  defaultMarketCountry: string;
  preferences?: {
    countryCode?: string | null;
    displayCurrency?: string | null;
    locale?: string | null;
    distanceUnit?: DistanceUnit | null;
  } | null;
  browsingCountry?: string | null;
  requestCountry?: string | null;
  viewerTimeZone?: string | null;
  viewerLocale?: string | null;
};

export function resolveLocaleContext(input: LocaleContextInput): LocaleContext {
  const open = new Map(
    input.markets
      .filter((m) => isMarketOpen(m.status))
      .map((m) => [m.countryCode, m]),
  );
  const pick = (code: string | null | undefined): PublicMarket | null =>
    code ? (open.get(code.toUpperCase()) ?? null) : null;

  let market: PublicMarket | null = null;
  let source: LocaleContext["source"] = "default";
  const prefMarket = pick(input.preferences?.countryCode);
  const browsingMarket = pick(input.browsingCountry);
  const requestMarket = pick(input.requestCountry);
  if (browsingMarket) {
    market = browsingMarket;
    source = "browsing";
  } else if (prefMarket) {
    market = prefMarket;
    source = "preference";
  } else if (requestMarket) {
    market = requestMarket;
    source = "request";
  }
  if (!market) {
    market =
      open.get(input.defaultMarketCountry) ??
      input.markets.find((m) => m.countryCode === input.defaultMarketCountry) ??
      null;
    source = "default";
  }
  if (!market) {
    throw new Error("No market is configured");
  }

  const viewerCountry =
    input.preferences?.countryCode?.toUpperCase() ??
    input.requestCountry?.toUpperCase() ??
    null;

  const displayCurrency =
    input.preferences?.displayCurrency?.toUpperCase() ??
    // A viewer from another open market keeps their own currency for
    // estimates even while browsing abroad.
    (viewerCountry && open.get(viewerCountry)?.defaultCurrency) ??
    market.defaultCurrency;

  return {
    marketCountry: market.countryCode,
    viewerCountry,
    displayCurrency,
    locale:
      input.preferences?.locale ?? input.viewerLocale ?? market.defaultLocale,
    distanceUnit: input.preferences?.distanceUnit ?? market.distanceUnit,
    timeZone: input.viewerTimeZone ?? market.defaultTimeZone,
    source,
  };
}
