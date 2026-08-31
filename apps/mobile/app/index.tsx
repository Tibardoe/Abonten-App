import { Text, View } from "react-native";

export default function Home() {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-background">
      <Text className="text-3xl font-bold text-mint">Abonten</Text>
      <Text className="text-sm text-muted-foreground">
        Mobile app skeleton — Phase 4.2 (NativeWind + shared tokens)
      </Text>
    </View>
  );
}
