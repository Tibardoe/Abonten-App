import { AppText, Card, Divider, Icon } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";

// Native echo of the web settings/overview "Quick Links" card. The web page
// also shows PromotionDetails (the user's active paid promotions) — that's
// a later pass (docs/mobile/09).
export default function SettingsOverview() {
  const router = useRouter();

  const Row = ({
    label,
    onPress,
  }: {
    label: string;
    onPress: () => void;
  }) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center justify-between py-3 active:opacity-70"
    >
      <AppText className="text-[15px] text-foreground">{label}</AppText>
      <Icon name="chevron-forward" size={18} tone="muted" />
    </Pressable>
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 p-4"
    >
      <AppText variant="label">Quick links</AppText>
      <Card padded>
        <Row
          label="Manage payment method"
          onPress={() => router.push("/(app)/wallet")}
        />
        <Divider />
        <Row
          label="View transaction history"
          onPress={() => router.push("/(app)/tickets")}
        />
      </Card>
      <View className="h-2" />
      <AppText variant="caption">
        Active promotions aren't shown on mobile yet — manage them on the web.
      </AppText>
    </ScrollView>
  );
}
