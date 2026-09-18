import { type ReactNode, useCallback, useRef } from "react";
import {
  type LayoutChangeEvent,
  type StyleProp,
  type View,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useKeyboardLift } from "./useKeyboardLift";

// The app's replacement for React Native's KeyboardAvoidingView.
//
// It does the same job — shrink a full-height container from the bottom by
// however much of the keyboard overlaps it — but the inset is driven by the
// keyboard's UI-thread animation (useKeyboardLift), so the content moves with
// the keys as one motion instead of jumping once the keyboard has landed
// (KeyboardAvoidingView on Android only reacts to `keyboardDidShow`, and on
// an edge-to-edge window nothing else moves the content at all).
//
// Like KeyboardAvoidingView it accounts for its own distance from the bottom
// of the window: a container that sits above a tab bar is only inset by the
// part of the keyboard that rises past that bar. The distance is measured
// once per layout, off the JS thread's critical path.
//
// Use it around any screen-level surface that has a bottom-anchored control
// (a chat thread and its composer, a form with a sticky action). Bottom
// sheets do their own lift (Sheet.tsx) and must not be wrapped in this.
export function KeyboardInsetView({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const keyboard = useKeyboardLift();
  const { height: windowHeight } = useWindowDimensions();
  const ref = useRef<View>(null);
  // How far this view's bottom edge sits above the window's bottom edge
  // (a tab bar, a footer). The keyboard covers that gap first.
  const bottomGap = useSharedValue(0);

  const onLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      ref.current?.measureInWindow((_x, y, _w, h) => {
        bottomGap.value = Math.max(0, Math.round(windowHeight - (y + h)));
      });
    },
    [bottomGap, windowHeight],
  );

  const inset = useAnimatedStyle(() => ({
    paddingBottom: Math.max(0, keyboard.height.value - bottomGap.value),
  }));

  return (
    <Animated.View
      ref={ref}
      onLayout={onLayout}
      style={[{ flex: 1 }, style, inset]}
    >
      {children}
    </Animated.View>
  );
}
