import { AppText } from "@abonten/ui-native";
import { View } from "react-native";

export function DaySeparator({ label }: { label: string }) {
  return (
    <View className="items-center py-3">
      <View className="rounded-full bg-muted px-3 py-1">
        <AppText variant="caption" className="font-semibold">
          {label}
        </AppText>
      </View>
    </View>
  );
}
