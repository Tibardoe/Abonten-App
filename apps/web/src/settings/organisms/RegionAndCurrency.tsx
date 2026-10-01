"use client";

import getLocalePreferences from "@/actions/getLocalePreferences";
import updateLocalePreferences from "@/actions/updateLocalePreferences";
import { useMarketContext } from "@/hooks/useMarketContext";
import { useToast } from "@/hooks/useToast";
import { countryFlag } from "@abonten/core/geo/countries";
import { getCurrency } from "@abonten/core/money/currencies";
import type { LocalePreferencesPatch } from "@abonten/types/marketType";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

// Settings › Region & currency: which market is home (it decides the
// currency Abonten Credit opens in and the wallet's payment rails), which
// currency price estimates are shown in, and kilometres or miles. Prices
// themselves are always shown and charged in the listing's own currency.
const ESTIMATE_EXTRAS = ["USD", "EUR", "GBP"];

const selectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50";

export default function RegionAndCurrency() {
  const t = useTranslations("settings");

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
        toast.error(res.message ?? t("couldnTSaveYourPreferences"));
        return;
      }
      toast.success(t("saved"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["locale-preferences"] }),
        queryClient.invalidateQueries({ queryKey: ["market-context"] }),
      ]);
    });

  if (prefs.isPending) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (!current) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("signInToChooseYourRegion")}
      </p>
    );
  }

  return (
    <form
      className="flex max-w-md flex-col gap-6"
      onSubmit={(e) => e.preventDefault()}
    >
      <label className="flex flex-col gap-2">
        <span className="font-medium">{t("homeCountry")}</span>
        <span className="text-sm text-muted-foreground">
          {t("setsWhichCountrySPaymentOptions")}
        </span>
        <select
          className={selectClass}
          disabled={pending}
          value={current.countryCode ?? ""}
          onChange={(e) => save({ countryCode: e.target.value })}
        >
          {current.countryCode == null ? (
            <option value="">{t("choose")}</option>
          ) : null}
          {markets.map((m) => (
            <option key={m.countryCode} value={m.countryCode}>
              {countryFlag(m.countryCode)} {m.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-medium">{t("showPriceEstimatesIn")}</span>
        <span className="text-sm text-muted-foreground">
          {t("listingsAbroadCanShowARough")}
        </span>
        <select
          className={selectClass}
          disabled={pending}
          value={current.displayCurrency ?? ""}
          onChange={(e) => save({ displayCurrency: e.target.value || null })}
        >
          <option value="">{t("myHomeCurrency")}</option>
          {currencies.map((code) => (
            <option key={code} value={code}>
              {code} — {getCurrency(code).name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-medium">{t("distances")}</span>
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
          <option value="">{t("countryDefault")}</option>
          <option value="km">{t("kilometres")}</option>
          <option value="mi">{t("miles")}</option>
        </select>
      </label>
    </form>
  );
}
