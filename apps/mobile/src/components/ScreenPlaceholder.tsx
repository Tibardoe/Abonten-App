import { AppText } from "@abonten/ui-native";
import { View } from "react-native";

export function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-background px-6">
      <AppText variant="pageTitle">{title}</AppText>
      <AppText variant="muted">Coming in a later phase.</AppText>
    </View>
  );
}
