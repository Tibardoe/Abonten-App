import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { AppText, Icon } from "@abonten/ui-native";
import { Pressable, View } from "react-native";
import { describeArea } from "./areaCopy";

// The location switcher at the top of Explore and Places: the area's name
// under a one-word line that says how it relates to the phone — "Near you"
// while the area follows the phone, "Browsing" when the person chose it,
// "Location off" when the phone cannot be read. So the answer to "what is
// Abonten showing me, and why?" is always on screen, and a chosen area is
// never mistaken for where the phone says the person is.

export function AreaSwitcher({ onPress }: { onPress: () => void }) {
  const { area, devicePermission } = useExploreLocation();
  const shown = describeArea(area, devicePermission);
  const label = area?.label ?? "Set location";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Change location. ${shown.eyebrow}: ${label}`}
      onPress={onPress}
      className="flex-1 flex-row items-center gap-2 active:opacity-70"
    >
      <Icon
        name={shown.icon}
        size={22}
        tone={shown.status === "location_off" ? "muted" : "primary"}
      />
      <View className="shrink">
        <AppText variant="caption" numberOfLines={1}>
          {shown.eyebrow}
        </AppText>
        <View className="flex-row items-center gap-1">
          <AppText variant="bodyStrong" numberOfLines={1} className="shrink">
            {label}
          </AppText>
          <Icon name="chevron-down" size={16} tone="muted" />
        </View>
      </View>
    </Pressable>
  );
}
