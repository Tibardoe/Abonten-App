import { AppHeader } from "@/components/app/AppHeader";
import {
  MARKET_CONTEXT_KEY,
  useMarket,
} from "@/features/markets/MarketProvider";
import { api } from "@/lib/api";
import { countryFlag } from "@abonten/core/geo/countries";
import { getCurrency } from "@abonten/core/money/currencies";
import type {
  LocalePreferences,
  LocalePreferencesPatch,
} from "@abonten/types/marketType";
import { AppText, Icon, useToast } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

// Settings › Region & currency, the native echo of the web page: home
// country (decides the wallet's payment options and the currency Abonten
// Credit opens in), the currency "≈" price estimates are shown in, and
// kilometres or miles. Prices are always shown and paid in the listing's
// own currency; nothing here changes what anyone is charged.
const ESTIMATE_EXTRAS = ["USD", "EUR", "GBP"];
const PREFS_KEY = ["mobile", "account", "locale"] as const;

function Choice({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`flex-row items-center justify-between rounded-xl border px-4 py-3.5 ${
        selected ? "border-primary bg-card" : "border-border bg-card"
      }`}
    >
      <AppText variant="body">{label}</AppText>
      {selected ? <Icon name="checkmark" size={18} tone="primary" /> : null}
    </Pressable>
  );
}

function Section({
  title,
  hint,
  children,
}: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <AppText variant="cardTitle">{title}</AppText>
      {hint ? (
        <AppText variant="small" tone="muted">
          {hint}
        </AppText>
      ) : null}
      <View className="gap-2">{children}</View>
    </View>
  );
}

export default function RegionSettings() {
  const t = useTranslations("settings");
  const toast = useToast();
  const queryClient = useQueryClient();
  const { markets } = useMarket();

  const prefs = useQuery({
    queryKey: PREFS_KEY,
    queryFn: async (): Promise<LocalePreferences> => {
      const res = await api.account.localePreferences();
      if (res.status !== 200 || !res.data)
        throw new Error(res.message ?? "Unavailable");
      return res.data;
    },
  });

  const save = useMutation({
    mutationFn: async (patch: LocalePreferencesPatch) => {
      const res = await api.account.updateLocalePreferences(patch);
      if (res.status !== 200 || !res.data)
        throw new Error(res.message ?? "Couldn't save.");
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(PREFS_KEY, data);
      void queryClient.invalidateQueries({ queryKey: MARKET_CONTEXT_KEY });
      toast.success("Saved.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Couldn't save.");
    },
  });

  const current = prefs.data;
  const busy = save.isPending;
  const currencies = [
    ...new Set([...markets.map((m) => m.defaultCurrency), ...ESTIMATE_EXTRAS]),
  ].sort();

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("nav.region")}
        backFallback="/(app)/settings"
      />
      {!current ? (
        <View className="flex-1 items-center justify-center p-6">
          {prefs.isError ? (
            <AppText variant="muted">
              Couldn't load your settings. Pull back and try again.
            </AppText>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      ) : (
        <ScrollView
          className="flex-1 bg-background"
          contentContainerClassName="gap-6 p-4"
        >
          <Section
            title="Home country"
            hint="Sets which country's payment options your wallet uses. Your Abonten Credit stays in the currency it started in."
          >
            {markets.map((m) => (
              <Choice
                key={m.countryCode}
                label={`${countryFlag(m.countryCode)}  ${m.name}`}
                selected={current.countryCode === m.countryCode}
                disabled={busy}
                onPress={() => save.mutate({ countryCode: m.countryCode })}
              />
            ))}
          </Section>

          <Section
            title="Show price estimates in"
            hint="Listings abroad can show a rough “≈” price in this currency. You always pay in the listing's own currency."
          >
            <Choice
              label="My home currency"
              selected={current.displayCurrency == null}
              disabled={busy}
              onPress={() => save.mutate({ displayCurrency: null })}
            />
            {currencies.map((code) => (
              <Choice
                key={code}
                label={`${code} — ${getCurrency(code).name}`}
                selected={current.displayCurrency === code}
                disabled={busy}
                onPress={() => save.mutate({ displayCurrency: code })}
              />
            ))}
          </Section>

          <Section title="Distances">
            <Choice
              label="Country default"
              selected={current.distanceUnit == null}
              disabled={busy}
              onPress={() => save.mutate({ distanceUnit: null })}
            />
            <Choice
              label="Kilometres"
              selected={current.distanceUnit === "km"}
              disabled={busy}
              onPress={() => save.mutate({ distanceUnit: "km" })}
            />
            <Choice
              label="Miles"
              selected={current.distanceUnit === "mi"}
              disabled={busy}
              onPress={() => save.mutate({ distanceUnit: "mi" })}
            />
          </Section>
        </ScrollView>
      )}
    </View>
  );
}
