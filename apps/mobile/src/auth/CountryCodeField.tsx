import {
  type Country,
  matchCountry,
  phoneCountries,
} from "@abonten/core/countries";
import { AppText, Icon, Input, Sheet } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

// The phone country-code control: a compact "🇬🇭 +233 ▾" chip that opens a
// searchable sheet of every country (match on name, dial code or ISO code),
// with the countries Abonten is open in listed first. Country data is the
// shared @abonten/core/countries list, so it stays in lock-step with the web
// PhoneInput dropdown.

export function CountryCodeField({
  value,
  onChange,
  priority = [],
}: {
  value: Country;
  onChange: (country: Country) => void;
  /** ISO codes listed first: the open markets, then the visitor's own. */
  priority?: readonly string[];
}) {
  const t = useTranslations("auth");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { locale } = useLocale();
  // Named and sorted in the reader's language.
  const ordered = useMemo(
    () => phoneCountries(priority, locale),
    [priority, locale],
  );
  const valueName =
    ordered.find((c) => c.countryCode === value.countryCode)?.name ??
    value.name;
  const results = matchCountry(query, ordered);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("countryCodeCurrently", {
          name: valueName,
          callingCode: value.callingCode,
        })}
        onPress={() => setOpen(true)}
        className="h-[52px] flex-row items-center gap-1.5 rounded-xl border border-input bg-background px-3 active:opacity-70"
      >
        <AppText className="text-[16px]">{value.flag}</AppText>
        <AppText variant="body" className="font-medium">
          {value.callingCode}
        </AppText>
        <Icon name="chevron-down" size={14} tone="muted" />
      </Pressable>

      <Sheet open={open} onClose={close} title={t("selectCountry")}>
        <View className="gap-3">
          <Input
            placeholder={t("searchByNameOrCode")}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View className="overflow-hidden rounded-lg border border-border">
            {results.length === 0 ? (
              <AppText variant="muted" className="p-3">
                {t("noCountryMatches", { query: query })}
              </AppText>
            ) : (
              results.map((c, i) => {
                const selected = c.countryCode === value.countryCode;
                return (
                  <Pressable
                    key={c.countryCode}
                    accessibilityRole="button"
                    onPress={() => {
                      onChange(c);
                      close();
                    }}
                    className={`flex-row items-center gap-3 px-3 py-3 active:opacity-70 ${
                      i > 0 ? "border-t border-border" : ""
                    } ${selected ? "bg-accent" : ""}`}
                  >
                    <AppText className="text-[18px]">{c.flag}</AppText>
                    <AppText variant="body" className="flex-1">
                      {c.name}
                    </AppText>
                    <AppText variant="muted">{c.callingCode}</AppText>
                    {selected ? (
                      <Icon name="checkmark" size={16} tone="primary" />
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      </Sheet>
    </>
  );
}
