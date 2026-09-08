import { AppText, Icon, type IoniconName } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useEffect } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Rect } from "./contextMenu/menuPlacement";

// A menu that drops out of the control that opened it, the way iOS pulls a
// menu out of a navigation-bar button — NOT a bottom sheet. A sheet throws a
// full-width surface up from the opposite end of the screen for what is a
// small, header-anchored choice; this stays visually attached to the "..."
// button, so the connection between the control and its options is obvious.
//
// Positioned from the button's own measured frame (measureInWindow), never a
// hardcoded offset, and clamped to the safe area so it can't run off-screen
// on any device.

export type AnchoredMenuItem = {
  key: string;
  label: string;
  icon: IoniconName;
  destructive?: boolean;
  onPress: () => void;
};

const ROW_H = 46;
const MENU_W = 232;
const GAP = 6;

export function AnchoredMenu({
  open,
  anchor,
  items,
  onClose,
}: {
  open: boolean;
  /** Window frame of the button that opened this. */
  anchor: Rect | null;
  items: AnchoredMenuItem[];
  onClose: () => void;
}) {
  const c = useThemeColors();
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = open
      ? withSpring(1, { damping: 18, stiffness: 260, mass: 0.7 })
      : withTiming(0, { duration: 110 });
  }, [open, progress]);

  // Hug the button's right edge, then clamp into the safe width.
  const right = anchor
    ? Math.max(12, screen.width - (anchor.x + anchor.width))
    : 12;
  const top = anchor
    ? Math.min(
        anchor.y + anchor.height + GAP,
        screen.height - insets.bottom - 12 - items.length * ROW_H,
      )
    : insets.top;

  const menuStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * -8 },
      { scale: 0.94 + 0.06 * progress.value },
    ],
  }));

  if (!open || !anchor) return null;

  return (
    <Modal
      transparent
      visible={open}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }} accessibilityViewIsModal>
        {/* Lighter than the message overlay's scrim: this is a small menu,
            not a mode, so the thread stays fully legible behind it. */}
        {/* The dim is a CHILD of the animated wrapper, not a style on it:
            Reanimated warns (and can clobber) when a layout animation and a
            static `opacity` land on the same view. */}
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(110)}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: c.overlay, opacity: 0.35 },
            ]}
          />
        </Animated.View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss menu"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          style={[
            {
              position: "absolute",
              top,
              right,
              width: MENU_W,
              borderRadius: 14,
              backgroundColor: c.popover,
              shadowColor: "#000",
              shadowOpacity: 0.18,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: 10 },
              elevation: 16,
              overflow: "hidden",
              // Grow out of the button it hangs from.
              transformOrigin: "top right",
            },
            menuStyle,
          ]}
        >
          {items.map((item, i) => {
            const tint = item.destructive ? c.destructive : c.foreground;
            return (
              <View key={item.key}>
                {i > 0 ? (
                  <View
                    style={{
                      height: StyleSheet.hairlineWidth,
                      backgroundColor: c.border,
                    }}
                  />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={() => {
                    onClose();
                    item.onPress();
                  }}
                  android_ripple={{ color: c.accent }}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? c.accent : "transparent",
                  })}
                >
                  <View
                    style={{
                      height: ROW_H,
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                    }}
                  >
                    <AppText
                      variant="body"
                      numberOfLines={1}
                      style={{
                        flexGrow: 1,
                        flexShrink: 1,
                        marginRight: 12,
                        fontSize: 16,
                        color: tint,
                      }}
                    >
                      {item.label}
                    </AppText>
                    <Icon name={item.icon} size={20} color={tint} />
                  </View>
                </Pressable>
              </View>
            );
          })}
        </Animated.View>
      </View>
    </Modal>
  );
}
