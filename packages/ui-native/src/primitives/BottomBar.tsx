import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardLift } from "./useKeyboardLift";

// The sticky footer container every fixed bottom control in the app should
// sit in — a chat composer, a "Proceed to checkout" bar, an event/place
// detail CTA. It resolves the one thing every one of those got wrong:
//
//   • keyboard closed → pad the bottom by the device safe-area inset (the
//     iPhone home-indicator strip / Android gesture bar), never a bare
//     `p-4`, so the control never sits on the home-indicator line.
//   • keyboard open   → the screen's <KeyboardInsetView> has lifted this bar
//     clear of the keyboard, so the inset collapses to a hairline — adding
//     it again here would leave a fat dead gap above the keyboard (double
//     safe-area pad).
//
// The collapse is continuous: it reads the keyboard's UI-thread height
// (useKeyboardLift) and gives the inset back over the first few pixels of
// the keyboard's travel, so the bar never visibly snaps between two paddings
// the moment the keyboard lands.
//
// Everything else (background, border, horizontal / top padding) is the
// caller's via `className`, so this stays a drop-in wrapper.

export type BottomBarProps = {
  children: ReactNode;
  /**
   * Tailwind classes for the container. Defaults to a top hairline + card
   * background + comfortable horizontal / top padding. Pass your own to
   * override (e.g. a transparent overlay CTA on a detail screen).
   */
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Floor for the keyboard-closed bottom padding (added under the inset). */
  minInset?: number;
  /** Bottom padding while the keyboard is open. */
  keyboardInset?: number;
};

export function BottomBar({
  children,
  className = "border-t border-border bg-card px-4 pt-3",
  style,
  minInset = 10,
  keyboardInset = 6,
}: BottomBarProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardLift();
  const resting = Math.max(insets.bottom, minInset);

  const padding = useAnimatedStyle(() => ({
    paddingBottom: Math.max(keyboardInset, resting - keyboard.height.value),
  }));

  return (
    <Animated.View className={className} style={[padding, style]}>
      {children}
    </Animated.View>
  );
}
