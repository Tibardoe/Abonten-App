import { Sheet, SheetOption } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
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
  const t = useTranslations("profile");

  const router = useRouter();

  const go = (path: string) => {
    onClose();
    router.push(path);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("create")}
      minHeightRatio={0.42}
    >
      <View className="gap-3">
        <SheetOption
          icon="calendar-outline"
          title={t("postEvent")}
          subtitle={t("sellTicketsOrTakeRsvps")}
          onPress={() => go("/(app)/event/new")}
        />
        <SheetOption
          icon="storefront-outline"
          title={t("addPlace")}
          subtitle={t("listAVenueRestaurantOrSpot")}
          onPress={() => go("/(app)/place/new")}
        />
      </View>
    </Sheet>
  );
}
