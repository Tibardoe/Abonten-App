import { useSession } from "@/auth/SessionProvider";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { api } from "@/lib/api";
import { getInstallId } from "@/lib/installId";
import {
  type RateTable,
  convertForDisplay,
} from "@abonten/core/money/conversion";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { fromMajor } from "@abonten/core/money/money";
import type {
  LocaleContext,
  MarketContextResult,
  PublicMarket,
} from "@abonten/types/marketType";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { createContext, useContext, useMemo } from "react";
import { Platform } from "react-native";
import { MARKET_CONTEXT_KEY } from "./marketContextCache";

// What makes the app local, for every screen: the open markets, the market
// the person is browsing (from the browsing area's point, looked up on the
// server), the currency estimates are shown in, the distance unit, the
// viewer's zone, the display-rate table and the feature flags that apply.
//
// Prices are always SHOWN in their own currency (a Lagos ticket reads ₦);
// `estimate()` adds a "≈ GH₵…" line in the viewer's currency only when the
// `currency.display_conversion` flag is on and a fresh rate exists. Nothing
// here is ever used to charge: the server prices every order itself.
//
// The answer is public configuration plus the person's own preferences, so
// it is persisted (queryPersistPolicy) and an offline cold start still
// knows the market. Until the first answer arrives the provider says so
// (`ready: false`) and screens fall back to the listing's own currency.

export { MARKET_CONTEXT_KEY } from "./marketContextCache";

type MarketValue = {
  ready: boolean;
  markets: PublicMarket[];
  context: LocaleContext | null;
  /** The market being browsed (or the default market), once known. */
  market: PublicMarket | null;
  rates: RateTable | null;
  flags: Record<string, boolean>;
  flag: (key: string) => boolean;
  /**
   * "≈ £12.40" for an amount in another currency, or null when no estimate
   * applies (same currency, conversion off, no rate, or the rate too old).
   */
  estimate: (
    amountMajor: number | string | null | undefined,
    currency: string,
  ) => string | null;
};

const MarketContext = createContext<MarketValue | null>(null);

const viewerTimeZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
})();

const viewerLocale = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? null;
  } catch {
    return null;
  }
})();

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const { area } = useExploreLocation();
  // A kilometre of precision is plenty to name the country and keeps the
  // key from changing on every small move.
  const lat = area ? Math.round(area.lat * 100) / 100 : null;
  const lng = area ? Math.round(area.lng * 100) / 100 : null;

  const query = useQuery({
    queryKey: [...MARKET_CONTEXT_KEY, session?.user.id ?? null, lat, lng],
    queryFn: async (): Promise<MarketContextResult> => {
      const res = await api.markets.context({
        platform: Platform.OS === "android" ? "android" : "ios",
        lat,
        lng,
        appVersion: Constants.expoConfig?.version ?? null,
        installId: await getInstallId(),
        tz: viewerTimeZone,
        locale: viewerLocale,
      });
      if (res.status !== 200 || !res.data) {
        // Keep the last good answer (possibly restored from disk).
        throw new Error(res.message ?? "Market context unavailable");
      }
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
    placeholderData: (previous) => previous,
  });

  const value = useMemo<MarketValue>(() => {
    const data = query.data ?? null;
    const markets = data?.markets ?? [];
    const context = data?.context ?? null;
    const market =
      markets.find((m) => m.countryCode === context?.marketCountry) ?? null;
    const flags = data?.flags ?? {};
    const rates = data?.rates ?? null;
    const conversionOn = flags["currency.display_conversion"] === true;
    return {
      ready: !!data,
      markets,
      context,
      market,
      rates,
      flags,
      flag: (key) => flags[key] === true,
      estimate: (amountMajor, currency) => {
        if (!conversionOn || !rates || !context) return null;
        if (!currency || currency.toUpperCase() === context.displayCurrency)
          return null;
        const num =
          typeof amountMajor === "string" ? Number(amountMajor) : amountMajor;
        if (num == null || !Number.isFinite(num) || num <= 0) return null;
        const converted = convertForDisplay(
          fromMajor(num, currency),
          context.displayCurrency,
          rates,
        );
        if (!converted || converted.stale) return null;
        return `≈ ${formatMoney(converted.approx, {
          locale: context.locale,
          trimZeroFraction: true,
          viewerCurrency: context.displayCurrency,
        })}`;
      },
    };
  }, [query.data]);

  return (
    <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
  );
}

export function useMarket(): MarketValue {
  const value = useContext(MarketContext);
  if (!value) throw new Error("useMarket must be used inside MarketProvider");
  return value;
}
