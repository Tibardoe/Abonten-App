import { AppText, Icon, type IoniconName } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useState } from "react";
import { type LayoutChangeEvent, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";

// Native echo of the web profile tab bar (UserAccountTabsNavigation): a
// full-width row on a top border, one slot per tab with a stacked icon +
// label. The active accent is a single underline bar that *slides* between
// tabs (200ms, or an instant jump when the OS "reduce motion" setting is
// on) instead of snapping — the small touch that makes the switch feel
// native rather than a re-render. Same tab set as web: Events · Places ·
// Favorites (own profile only) · Reviews.

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
  const c = useThemeColors();
  const reduceMotion = useReducedMotion();
  const [barWidth, setBarWidth] = useState(0);
  const slotWidth = barWidth > 0 ? barWidth / tabs.length : 0;
  const activeIndex = Math.max(0, tabs.indexOf(value));

  function onLayout(e: LayoutChangeEvent) {
    setBarWidth(e.nativeEvent.layout.width);
  }

  const indicatorStyle = useAnimatedStyle(() => {
    const x = activeIndex * slotWidth;
    return {
      width: slotWidth,
      transform: [
        {
          translateX: reduceMotion ? x : withTiming(x, { duration: 200 }),
        },
      ],
    };
  }, [activeIndex, slotWidth, reduceMotion]);

  return (
    <View
      accessibilityRole="tablist"
      onLayout={onLayout}
      className="border-t border-border"
    >
      <View className="flex-row">
        {tabs.map((key) => {
          const active = key === value;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={LABELS[key]}
              onPress={() => onChange(key)}
              className="min-h-[52px] flex-1 items-center justify-center gap-1 py-2 active:opacity-70"
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
      {slotWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              height: 2,
              backgroundColor: c.primary,
            },
            indicatorStyle,
          ]}
        />
      ) : null}
    </View>
  );
}
