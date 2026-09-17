import type {
  ListingKind,
  ProfileTab,
} from "@abonten/core/content/profileContent";
import { AppText, Icon, type IoniconName } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useRef, useState } from "react";
import { type LayoutChangeEvent, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";

// Native echo of the web profile tab bar: a full-width row on a top border,
// one slot per tab with a stacked icon + label, and a single underline that
// slides between tabs (200ms; instant with reduce motion).
//
// The first slot is a selector: "Events ⌄" or "Places ⌄". Tapping it while
// it is already the active tab (or tapping any time its chevron is showing)
// opens a small menu to switch between the two, anchored under the slot by
// the screen (`onOpenListingMenu` hands over the slot's window frame). The
// chevron turns while the menu is open, so what opened it is never unclear.

export type ProfileTabKey = ProfileTab;
export type Rect = { x: number; y: number; width: number; height: number };

const ICONS: Record<Exclude<ProfileTab, "listings">, IoniconName> = {
  spotlights: "play-circle-outline",
  favorites: "heart-outline",
  reviews: "star-outline",
};

const LABELS: Record<Exclude<ProfileTab, "listings">, string> = {
  spotlights: "Spotlights",
  favorites: "Favorites",
  reviews: "Reviews",
};

export const LISTING_LABEL: Record<ListingKind, string> = {
  events: "Events",
  places: "Places",
};
export const LISTING_ICON: Record<ListingKind, IoniconName> = {
  events: "calendar-outline",
  places: "location-outline",
};

export function ProfileTabBar({
  tabs,
  value,
  onChange,
  listingKind,
  listingMenuOpen,
  onOpenListingMenu,
}: {
  tabs: ProfileTab[];
  value: ProfileTab;
  onChange: (key: ProfileTab) => void;
  listingKind: ListingKind;
  listingMenuOpen: boolean;
  onOpenListingMenu: (anchor: Rect) => void;
}) {
  const c = useThemeColors();
  const reduceMotion = useReducedMotion();
  const [barWidth, setBarWidth] = useState(0);
  const slotWidth = barWidth > 0 ? barWidth / tabs.length : 0;
  const activeIndex = Math.max(0, tabs.indexOf(value));
  const listingRef = useRef<View>(null);

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

  const chevronStyle = useAnimatedStyle(() => {
    const deg = listingMenuOpen ? 180 : 0;
    return {
      transform: [
        {
          rotate: `${reduceMotion ? deg : withTiming(deg, { duration: 180 })}deg`,
        },
      ],
    };
  }, [listingMenuOpen, reduceMotion]);

  const openMenu = () => {
    listingRef.current?.measureInWindow((x, y, width, height) => {
      onOpenListingMenu({ x, y, width, height });
    });
  };

  return (
    <View
      accessibilityRole="tablist"
      onLayout={onLayout}
      className="border-t border-border"
    >
      <View className="flex-row">
        {tabs.map((key) => {
          const active = key === value;
          if (key === "listings") {
            const label = LISTING_LABEL[listingKind];
            return (
              <Pressable
                key={key}
                ref={listingRef}
                accessibilityRole="tab"
                accessibilityState={{
                  selected: active,
                  expanded: listingMenuOpen,
                }}
                accessibilityLabel={`${label}. Double tap ${active ? "to switch between Events and Places" : "to show"}`}
                onPress={() => {
                  if (active) openMenu();
                  else onChange(key);
                }}
                onLongPress={openMenu}
                className="min-h-[52px] flex-1 items-center justify-center gap-1 py-2 active:opacity-70"
              >
                <Icon
                  name={LISTING_ICON[listingKind]}
                  size={20}
                  tone={active ? "foreground" : "muted"}
                />
                <View className="flex-row items-center gap-0.5">
                  <AppText
                    className={`text-[13px] ${
                      active
                        ? "font-bold text-foreground"
                        : "font-medium text-muted-foreground"
                    }`}
                  >
                    {label}
                  </AppText>
                  <Pressable
                    onPress={openMenu}
                    hitSlop={{ top: 12, bottom: 12, left: 6, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Switch between Events and Places"
                  >
                    <Animated.View style={chevronStyle}>
                      <Icon
                        name="chevron-down"
                        size={14}
                        tone={active ? "foreground" : "muted"}
                      />
                    </Animated.View>
                  </Pressable>
                </View>
              </Pressable>
            );
          }
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
