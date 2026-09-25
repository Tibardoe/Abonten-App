"use client";

import getLocalePreferences from "@/actions/getLocalePreferences";
import updateLocalePreferences from "@/actions/updateLocalePreferences";
import { useMarketContext } from "@/hooks/useMarketContext";
import { useToast } from "@/hooks/useToast";
import { countryFlag } from "@abonten/core/geo/countries";
import { getCurrency } from "@abonten/core/money/currencies";
import type { LocalePreferencesPatch } from "@abonten/types/marketType";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTransition } from "react";

// Settings › Region & currency: which market is home (it decides the
// currency Abonten Credit opens in and the wallet's payment rails), which
// currency price estimates are shown in, and kilometres or miles. Prices
// themselves are always shown and charged in the listing's own currency.
const ESTIMATE_EXTRAS = ["USD", "EUR", "GBP"];

const selectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50";

export default function RegionAndCurrency() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pending, start] = useTransition();
  const { markets } = useMarketContext();
  const prefs = useQuery({
    queryKey: ["locale-preferences"],
    queryFn: () => getLocalePreferences(),
  });
  const current = prefs.data?.status === 200 ? prefs.data.data : undefined;

  const currencies = [
    ...new Set([...markets.map((m) => m.defaultCurrency), ...ESTIMATE_EXTRAS]),
  ].sort();

  const save = (patch: LocalePreferencesPatch) =>
    start(async () => {
      const res = await updateLocalePreferences(patch);
      if (res.status !== 200) {
        toast.error(res.message ?? "Couldn't save your preferences.");
        return;
      }
      toast.success("Saved.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["locale-preferences"] }),
        queryClient.invalidateQueries({ queryKey: ["market-context"] }),
      ]);
    });

  if (prefs.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!current) {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in to choose your region and currency.
      </p>
    );
  }

  return (
    <form
      className="flex max-w-md flex-col gap-6"
      onSubmit={(e) => e.preventDefault()}
    >
      <label className="flex flex-col gap-2">
        <span className="font-medium">Home country</span>
        <span className="text-sm text-muted-foreground">
          Sets which country's payment options your wallet uses. Your Abonten
          Credit stays in the currency it started in.
        </span>
        <select
          className={selectClass}
          disabled={pending}
          value={current.countryCode ?? ""}
          onChange={(e) => save({ countryCode: e.target.value })}
        >
          {current.countryCode == null ? (
            <option value="">Choose…</option>
          ) : null}
          {markets.map((m) => (
            <option key={m.countryCode} value={m.countryCode}>
              {countryFlag(m.countryCode)} {m.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-medium">Show price estimates in</span>
        <span className="text-sm text-muted-foreground">
          Listings abroad can show a rough “≈” price in this currency. You
          always pay in the listing's own currency.
        </span>
        <select
          className={selectClass}
          disabled={pending}
          value={current.displayCurrency ?? ""}
          onChange={(e) => save({ displayCurrency: e.target.value || null })}
        >
          <option value="">My home currency</option>
          {currencies.map((code) => (
            <option key={code} value={code}>
              {code} — {getCurrency(code).name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-medium">Distances</span>
        <select
          className={selectClass}
          disabled={pending}
          value={current.distanceUnit ?? ""}
          onChange={(e) =>
            save({
              distanceUnit:
                e.target.value === "km" || e.target.value === "mi"
                  ? e.target.value
                  : null,
            })
          }
        >
          <option value="">Country default</option>
          <option value="km">Kilometres</option>
          <option value="mi">Miles</option>
        </select>
      </label>
    </form>
  );
}
