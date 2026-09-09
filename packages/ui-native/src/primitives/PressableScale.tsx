import { forwardRef, useCallback, useRef } from "react";
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";
import { hapticSelection } from "./haptics";
import { useReducedMotion } from "./useReducedMotion";

// The app's one touch-feedback primitive: a Pressable that dips a couple of
// percent (and, optionally, fires a selection haptic) the instant a finger
// lands, then springs back on release.
//
// Why this exists: `active:opacity-*` (NativeWind) only resolves after RN's
// press delay and reads as a flat blink. A scale driven on the *native*
// driver starts on touch-down, runs on the UI thread, and keeps running
// even while the JS thread is busy with the work the tap kicked off — so a
// tap is always acknowledged. That is the difference between "the app is
// thinking" and "did my tap register?".
//
// It animates the Pressable itself (not an inner wrapper) so the layout box,
// padding and flex direction the caller sets via `className` are untouched —
// this is a drop-in replacement for <Pressable>.
//
// Honours the OS reduce-motion setting: no scale then, and the caller's own
// `active:` opacity class still carries the state change.

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, "style"> & {
  /** How far to dip on press. 0.97 for cards/rows, 0.96 for buttons. */
  activeScale?: number;
  /** Fire a selection haptic on touch-down. Off by default — reserve it for
   *  primary actions and state toggles, not every row in a long list. */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
};

export const PressableScale = forwardRef<View, PressableScaleProps>(
  function PressableScale(
    {
      activeScale = 0.97,
      haptic = false,
      onPressIn,
      onPressOut,
      disabled,
      style,
      ...rest
    },
    ref,
  ) {
    const reducedMotion = useReducedMotion();
    const scale = useRef(new Animated.Value(1)).current;

    const animate = useCallback(
      (to: number) => {
        if (reducedMotion) return;
        Animated.spring(scale, {
          toValue: to,
          useNativeDriver: true,
          speed: 40,
          bounciness: 4,
        }).start();
      },
      [reducedMotion, scale],
    );

    return (
      <AnimatedPressable
        ref={ref as never}
        disabled={disabled}
        onPressIn={(e) => {
          if (!disabled) {
            animate(activeScale);
            if (haptic) hapticSelection();
          }
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          animate(1);
          onPressOut?.(e);
        }}
        style={[style, { transform: [{ scale }] }]}
        {...rest}
      />
    );
  },
);
