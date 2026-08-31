import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-background px-6">
      <Text className="text-lg font-bold text-foreground">Event</Text>
      <Text className="text-xs text-muted-foreground">{id}</Text>
      <Text className="text-sm text-muted-foreground">
        Full detail screen lands in a later slice.
      </Text>
    </View>
  );
}
