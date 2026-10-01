import { AppText } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

export function ScreenPlaceholder({ title }: { title: string }) {
  const t = useTranslations("common");

  return (
    <View className="flex-1 items-center justify-center gap-2 bg-background px-6">
      <AppText variant="pageTitle">{title}</AppText>
      <AppText variant="muted">{t("comingInALaterPhase")}</AppText>
    </View>
  );
}
