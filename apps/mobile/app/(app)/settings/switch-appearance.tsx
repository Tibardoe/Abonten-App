import { AppearanceToggle } from "@/components/app/AppearanceToggle";
import { AppText } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { ScrollView, View } from "react-native";

// Native echo of the web settings/switch-appearance page (`SwitchAppearance`
// organism). Reuses the shared AppearanceToggle; copy comes from the
// `settings.appearance.*` catalog.
export default function SwitchAppearance() {
  const t = useTranslations("settings");

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4"
    >
      <View className="gap-1">
        <AppText variant="bodyStrong">{t("appearance.title")}</AppText>
        <AppText variant="caption">{t("appearance.description")}</AppText>
      </View>

      <AppearanceToggle />

      <View className="gap-2 pt-2">
        <AppText variant="caption">
          • {t("appearance.light")} — {t("appearance.lightDescription")}
        </AppText>
        <AppText variant="caption">
          • {t("appearance.dark")} — {t("appearance.darkDescription")}
        </AppText>
        <AppText variant="caption">
          • {t("appearance.system")} — {t("appearance.systemDescription")}
        </AppText>
      </View>
    </ScrollView>
  );
}
