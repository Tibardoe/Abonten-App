import { hapticSelection } from "@/lib/haptics";
import type { ListingKind } from "@abonten/core/content/profileContent";
import { AppText, Icon, useReducedMotion } from "@abonten/ui-native";
import { shadow } from "@abonten/ui-native/theme";
import { useEffect } from "react";
import { BackHandler, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { LISTING_ICON, LISTING_LABEL, type Rect } from "./ProfileTabBar";

const OPTIONS: ListingKind[] = ["events", "places"];

// The Events / Places switch that drops from the profile's first tab. It
// grows out of the tab it belongs to (scale + fade from its top edge, 160ms)
// and closes on a choice, a tap anywhere else, or Android back.
export function ListingKindMenu({
  anchor,
  value,
  onSelect,
  onClose,
}: {
  anchor: Rect | null;
  value: ListingKind;
  onSelect: (kind: ListingKind) => void;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const presence = useSharedValue(0);
  const open = !!anchor;

  useEffect(() => {
    presence.value = open
      ? reduceMotion
        ? 1
        : withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) })
      : 0;
  }, [open, presence, reduceMotion]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  const style = useAnimatedStyle(() => ({
    opacity: presence.value,
    transform: [
      { translateY: (1 - presence.value) * -6 },
      { scale: 0.94 + presence.value * 0.06 },
    ],
  }));

  if (!anchor) return null;
  const width = Math.max(176, anchor.width + 40);
  const left = Math.max(12, anchor.x + anchor.width / 2 - width / 2);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityLabel="Close menu"
      />
      <Animated.View
        accessibilityRole="menu"
        style={[
          {
            position: "absolute",
            top: anchor.y + anchor.height + 4,
            left,
            width,
            transformOrigin: "top",
          },
          shadow.sheet,
          style,
        ]}
        className="overflow-hidden rounded-2xl border border-border bg-popover py-1"
      >
        {OPTIONS.map((kind) => {
          const selected = kind === value;
          return (
            <Pressable
              key={kind}
              accessibilityRole="menuitem"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show ${LISTING_LABEL[kind]}`}
              onPress={() => {
                hapticSelection();
                onSelect(kind);
              }}
              className="min-h-[48px] flex-row items-center gap-3 px-4 active:bg-muted"
            >
              <Icon
                name={LISTING_ICON[kind]}
                size={20}
                tone={selected ? "primary" : "foreground"}
              />
              <AppText
                variant="bodyStrong"
                className={`flex-1 ${selected ? "text-primary" : ""}`}
              >
                {LISTING_LABEL[kind]}
              </AppText>
              {selected ? (
                <Icon name="checkmark" size={18} tone="primary" />
              ) : null}
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}
