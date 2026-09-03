import { Sheet, SheetOption } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { View } from "react-native";

// The action menu behind the profile header's "+" button — the native
// counterpart of the web SideBar's CreateMenu (Post event / Add place).
// A bottom action sheet is the idiomatic mobile shape for a short "what do
// you want to create?" choice; shares the SheetOption row with the Add
// Wallet / Add Payout Account flows so every "choose a type" step matches.

export function CreateActionSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  const go = (path: string) => {
    onClose();
    router.push(path);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Create" minHeightRatio={0.42}>
      <View className="gap-3">
        <SheetOption
          icon="calendar-outline"
          title="Post event"
          subtitle="Sell tickets or take RSVPs"
          onPress={() => go("/(app)/event/new")}
        />
        <SheetOption
          icon="storefront-outline"
          title="Add place"
          subtitle="List a venue, restaurant or spot"
          onPress={() => go("/(app)/place/new")}
        />
      </View>
    </Sheet>
  );
}
