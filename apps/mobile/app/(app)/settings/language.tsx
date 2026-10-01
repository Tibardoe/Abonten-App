import { AppHeader } from "@/components/app/AppHeader";
import { AppText, Icon } from "@abonten/ui-native";
import {
  LOCALE_LABELS,
  LOCALE_ORDER,
  isPartialLocale,
  useLocale,
  useTranslations,
} from "@abonten/ui-native/i18n";
import { Pressable, ScrollView, View } from "react-native";

// Native echo of the web settings/language page (the `Language` organism):
// the supported languages in the same order, persisted per device. Same
// catalog (`@abonten/i18n`) the web app uses; a language that is only partly
// translated says so under its name.
export default function LanguageSettings() {
  const { locale, setLocale } = useLocale();
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("nav.language")}
        backFallback="/(app)/settings"
      />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-2 p-4"
      >
        {LOCALE_ORDER.map((code) => {
          const active = code === locale;
          const partial = isPartialLocale(code);
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={
                partial
                  ? `${LOCALE_LABELS[code]}. ${tc("languagePartial")}`
                  : LOCALE_LABELS[code]
              }
              onPress={() => setLocale(code)}
              className={`flex-row items-center justify-between rounded-xl border px-4 py-3.5 ${
                active ? "border-primary bg-card" : "border-border bg-card"
              }`}
            >
              <View className="flex-1 pr-3">
                <AppText variant="body">{LOCALE_LABELS[code]}</AppText>
                {/* Said in the language being read now, so the person
                    choosing can understand it before they switch. */}
                {partial ? (
                  <AppText variant="caption" tone="muted">
                    {tc("languagePartial")}
                  </AppText>
                ) : null}
              </View>
              {active ? (
                <Icon name="checkmark" size={18} tone="primary" />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
