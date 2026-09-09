import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { useThemeColors } from "../theme/ThemeProvider";
import { AppText } from "./Typography";
import { useReducedMotion } from "./useReducedMotion";

// Determinate + indeterminate progress, for the one thing a spinner cannot
// say: how much is left.
//
// Uploads over a slow connection are the case this exists for. A spinner on
// a 4MB flyer upload is indistinguishable from a frozen app; a bar that
// creeps is the difference between "wait" and "it's broken". Where the real
// fraction is unknown (server-side processing), `indeterminate` runs a
// sweep instead of faking a percentage — never a fake number.
//
// `scaleX` on the native driver, not an animated `width`: width is a layout
// property, so it re-lays-out every frame on the JS thread; a transform is a
// UI-thread mutation. Same picture, no jank while the upload saturates JS.

export type ProgressBarProps = {
  /** 0..1. Ignored when `indeterminate`. */
  value?: number;
  indeterminate?: boolean;
  height?: number;
  /** Short status line above the bar, e.g. "Uploading flyer". */
  label?: string;
  /** Show "72%" beside the label. Only meaningful when determinate. */
  showPercent?: boolean;
  className?: string;
};

/** Width of the sweeping bar in the indeterminate state, as a fraction of the track. */
const SWEEP_FRACTION = 0.4;

export function ProgressBar({
  value = 0,
  indeterminate = false,
  height = 6,
  label,
  showPercent = false,
  className,
}: ProgressBarProps) {
  const c = useThemeColors();
  const reducedMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, value));
  // The indeterminate sweep translates by measured pixels, so it needs the
  // track's real width. Zero until the first layout — the bar is simply
  // invisible for that one frame.
  const [trackWidth, setTrackWidth] = useState(0);

  // Determinate: animate the fill toward the reported fraction.
  const fill = useRef(new Animated.Value(clamped)).current;
  useEffect(() => {
    if (indeterminate) return;
    if (reducedMotion) {
      fill.setValue(clamped);
      return;
    }
    Animated.timing(fill, {
      toValue: clamped,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [clamped, indeterminate, reducedMotion, fill]);

  // Indeterminate: a bar that sweeps left to right on a loop.
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!indeterminate || reducedMotion) return;
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [indeterminate, reducedMotion, sweep]);

  const percent = Math.round(clamped * 100);

  return (
    <View
      className={["gap-1.5", className ?? ""].filter(Boolean).join(" ")}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={
        indeterminate ? undefined : { min: 0, max: 100, now: percent }
      }
    >
      {label || (showPercent && !indeterminate) ? (
        <View className="flex-row items-center justify-between">
          {label ? (
            <AppText variant="small" tone="muted">
              {label}
            </AppText>
          ) : (
            <View />
          )}
          {showPercent && !indeterminate ? (
            <AppText variant="small" className="font-semibold tabular-nums">
              {percent}%
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        style={{
          height,
          borderRadius: height,
          overflow: "hidden",
          backgroundColor: c.muted,
        }}
      >
        {indeterminate ? (
          <Animated.View
            style={{
              height,
              width: SWEEP_FRACTION * trackWidth,
              borderRadius: height,
              backgroundColor: c.primary,
              transform: [
                {
                  // Measured pixels, not percentage strings: numeric
                  // interpolation is the one form every RN version drives
                  // natively without a layout pass.
                  translateX: sweep.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-SWEEP_FRACTION * trackWidth, trackWidth],
                  }),
                },
              ],
            }}
          />
        ) : (
          <Animated.View
            style={{
              height,
              width: "100%",
              borderRadius: height,
              backgroundColor: c.primary,
              // Anchor the scale at the left edge, so the fill grows from
              // the start of the track rather than out of its centre.
              transformOrigin: "left center",
              transform: [{ scaleX: fill }],
            }}
          />
        )}
      </View>
    </View>
  );
}
