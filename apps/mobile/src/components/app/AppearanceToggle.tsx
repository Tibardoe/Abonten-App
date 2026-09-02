import { AppText } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { type ThemePreference, useTheme } from "@abonten/ui-native/theme";
import { Pressable, View } from "react-native";

// The /settings/switch-appearance control, reused wherever the app offers a
// Light / Dark / System choice. Copy comes from the shared `settings`
// catalog (settings.appearance.*), same keys the web SwitchAppearance uses.

const OPTIONS: ThemePreference[] = ["light", "dark", "system"];

export function AppearanceToggle() {
  const t = useTranslations("settings");
  const { preference, setPreference } = useTheme();

  return (
    <View className="flex-row gap-2">
      {OPTIONS.map((option) => {
        const active = preference === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => setPreference(option)}
            className={`flex-1 items-center rounded-lg border px-3 py-2 ${
              active
                ? "border-primary bg-primary"
                : "border-border bg-background"
            }`}
          >
            <AppText
              variant="small"
              className={`font-semibold ${
                active ? "text-primary-foreground" : "text-foreground"
              }`}
            >
              {t(`appearance.${option}`)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
