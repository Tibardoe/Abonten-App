import { Text, View } from "react-native";

export function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-background px-6">
      <Text className="text-2xl font-bold text-foreground">{title}</Text>
      <Text className="text-sm text-muted-foreground">
        Coming in a later phase.
      </Text>
    </View>
  );
}
