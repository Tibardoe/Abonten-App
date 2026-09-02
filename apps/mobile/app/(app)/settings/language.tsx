import { AppHeader } from "@/components/app/AppHeader";
import { AppText, Icon } from "@abonten/ui-native";
import {
  I18N_LOCALES,
  LOCALE_LABELS,
  useLocale,
  useTranslations,
} from "@abonten/ui-native/i18n";
import { Pressable, ScrollView, View } from "react-native";

// Native echo of the web settings/language page (the `Language` organism):
// a list of the six supported locales, persisted per device. Same catalog
// (`@abonten/i18n`) the web app uses.
export default function LanguageSettings() {
  const { locale, setLocale } = useLocale();
  const t = useTranslations("settings");

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
        {I18N_LOCALES.map((code) => {
          const active = code === locale;
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setLocale(code)}
              className={`flex-row items-center justify-between rounded-xl border px-4 py-3.5 ${
                active ? "border-primary bg-card" : "border-border bg-card"
              }`}
            >
              <AppText className="text-[15px] text-foreground">
                {LOCALE_LABELS[code] ?? code}
              </AppText>
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
