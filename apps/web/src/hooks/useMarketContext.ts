"use client";

import getMarketContext from "@/actions/getMarketContext";
import { takeShellSlice } from "@/hooks/shellBootstrap";
import type { PublicMarket } from "@abonten/core/market/types";
import { convertForDisplay } from "@abonten/core/money/conversion";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { fromMajor } from "@abonten/core/money/money";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useMemo } from "react";

const viewerTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
};

/**
 * The visitor's market context on the web: open markets, the market being
 * browsed (the request's country, else the person's saved country, else the
 * default market), the display currency, distance unit and zone, display
 * rates and feature flags. `estimate()` returns "≈ £12" for an amount in
 * another currency when the display-conversion flag is on — display only;
 * the server prices and charges every order in the listing's own currency.
 */
export function useMarketContext(browsingCountry?: string | null) {
  const locale = useLocale();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["market-context", browsingCountry ?? null],
    queryFn: async ({ queryKey }) => {
      // The shared answer is for the visitor's own market; a page about
      // another country's area asks for that country.
      if (!browsingCountry) {
        const shared = await takeShellSlice(
          client,
          "marketContext",
          undefined,
          queryKey,
        );
        if (shared !== undefined) return shared;
      }
      return getMarketContext({
        browsingCountry: browsingCountry ?? null,
        viewerTimeZone: viewerTimeZone(),
        viewerLocale:
          typeof navigator !== "undefined" ? navigator.language : null,
      });
    },
    staleTime: 10 * 60 * 1000,
  });

  return useMemo(() => {
    const data = query.data ?? null;
    const markets: PublicMarket[] = data?.markets ?? [];
    const context = data?.context ?? null;
    const market =
      markets.find((m) => m.countryCode === context?.marketCountry) ?? null;
    const flags = data?.flags ?? {};
    const conversionOn = flags["currency.display_conversion"] === true;
    return {
      ready: !!data,
      markets,
      market,
      context,
      flags,
      flag: (key: string) => flags[key] === true,
      estimate: (
        amountMajor: number | string | null | undefined,
        currency: string,
      ): string | null => {
        if (!conversionOn || !data?.rates || !context) return null;
        if (!currency || currency.toUpperCase() === context.displayCurrency)
          return null;
        const num =
          typeof amountMajor === "string" ? Number(amountMajor) : amountMajor;
        if (num == null || !Number.isFinite(num) || num <= 0) return null;
        const converted = convertForDisplay(
          fromMajor(num, currency),
          context.displayCurrency,
          data.rates,
        );
        if (!converted || converted.stale) return null;
        return `≈ ${formatMoney(converted.approx, {
          // The app's language, not the device's: the estimate reads like
          // every other amount on the screen.
          locale,
          trimZeroFraction: true,
          viewerCurrency: context.displayCurrency,
        })}`;
      },
    };
  }, [query.data, locale]);
}
