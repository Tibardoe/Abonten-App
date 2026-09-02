import { AppText, Icon, Sheet } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// The action menu behind the profile header's "+" button — the native
// counterpart of the web SideBar's CreateMenu (Post event / Add place).
// A bottom action sheet is the idiomatic mobile shape for a short "what do
// you want to create?" choice.

function Action({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="min-h-[64px] flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-accent">
        <Icon name={icon} size={22} tone="foreground" />
      </View>
      <View className="flex-1">
        <AppText className="text-[15px] font-semibold text-foreground">
          {title}
        </AppText>
        <AppText className="text-[12px] text-muted-foreground">
          {subtitle}
        </AppText>
      </View>
      <Icon name="chevron-forward" size={16} tone="muted" />
    </Pressable>
  );
}

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
    <Sheet open={open} onClose={onClose} title="Create">
      <View className="gap-3">
        <Action
          icon="calendar-outline"
          title="Post event"
          subtitle="Sell tickets or take RSVPs"
          onPress={() => go("/(app)/event/new")}
        />
        <Action
          icon="storefront-outline"
          title="Add place"
          subtitle="List a venue, restaurant or spot"
          onPress={() => go("/(app)/place/new")}
        />
      </View>
    </Sheet>
  );
}
