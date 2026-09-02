import { AppText, Icon, type IoniconName } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// Native echo of the web profile tab bar (UserAccountTabsNavigation /
// UserAccountTabsNavButton): a full-width row sitting on a top border, one
// slot per tab with a stacked icon + label. The active tab gets a primary
// top-border accent and bold label; inactive tabs are muted. Same tab set
// as web — Events · Places · Favorites (own profile only) · Reviews.

export type ProfileTabKey = "events" | "places" | "favorites" | "reviews";

const ICONS: Record<ProfileTabKey, IoniconName> = {
  events: "calendar-outline",
  places: "location-outline",
  favorites: "heart-outline",
  reviews: "star-outline",
};

const LABELS: Record<ProfileTabKey, string> = {
  events: "Events",
  places: "Places",
  favorites: "Favorites",
  reviews: "Reviews",
};

export function ProfileTabBar({
  tabs,
  value,
  onChange,
}: {
  tabs: ProfileTabKey[];
  value: ProfileTabKey;
  onChange: (key: ProfileTabKey) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row border-t border-border"
    >
      {tabs.map((key) => {
        const active = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={LABELS[key]}
            onPress={() => onChange(key)}
            className={`min-h-[52px] flex-1 items-center justify-center gap-1 border-t-2 py-2 active:opacity-70 ${
              active ? "border-primary" : "border-transparent"
            }`}
          >
            <Icon
              name={ICONS[key]}
              size={20}
              tone={active ? "foreground" : "muted"}
            />
            <AppText
              className={`text-[13px] ${
                active
                  ? "font-bold text-foreground"
                  : "font-medium text-muted-foreground"
              }`}
            >
              {LABELS[key]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
