import type { ReactNode } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardVisible } from "./useKeyboard";

// The sticky footer container every fixed bottom control in the app should
// sit in — a chat composer, a "Proceed to checkout" bar, an event/place
// detail CTA. It resolves the one thing every one of those got wrong:
//
//   • keyboard closed → pad the bottom by the device safe-area inset (the
//     iPhone home-indicator strip / Android gesture bar), never a bare
//     `p-4`, so the control never sits on the home-indicator line.
//   • keyboard open   → the OS (`adjustResize` on Android) or the screen's
//     KeyboardAvoidingView has already lifted this bar clear of the
//     keyboard, so the inset collapses to a hairline — adding it again here
//     would leave a fat dead gap above the keyboard (double safe-area pad).
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
  const keyboardVisible = useKeyboardVisible();
  const paddingBottom = keyboardVisible
    ? keyboardInset
    : Math.max(insets.bottom, minInset);

  return (
    <View className={className} style={[{ paddingBottom }, style]}>
      {children}
    </View>
  );
}
