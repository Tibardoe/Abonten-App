import { AppText } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useRef, useState } from "react";
import { type LayoutChangeEvent, PanResponder, View } from "react-native";

// Dual-thumb price range slider — the native stand-in for the web
// PriceRangeSlider. No dependency: two thumbs driven by PanResponder over a
// measured track. Domain 0..MAX; a max at/above ANY_THRESHOLD reads as
// "Any" and is reported as null (matches the web modal's [0, 999] "Any"
// sentinel).
//
// Previous version had two bugs: (1) it drove the thumb from `gesture.moveX`
// (an absolute screen coordinate) with no track offset, so inside the
// padded filter sheet every drag jumped the thumb far to the right; (2) the
// PanResponder was built once with `useRef(...).current`, capturing the
// first render's props, so after one drag it wrote against stale bounds and
// a stale `onChange`. This version drags by `gesture.dx` from the value at
// touch-start (no absolute offset needed) and reads live state through a
// ref.

const MAX = 1000;
const STEP = 10;
const ANY_THRESHOLD = 990;
const THUMB = 24;

function snap(v: number): number {
  return Math.round(v / STEP) * STEP;
}

export function PriceRangeField({
  min,
  max,
  onChange,
}: {
  /** null = no lower bound (treated as 0). */
  min: number | null;
  /** null = "Any" (no upper bound). */
  max: number | null;
  onChange: (next: { min: number | null; max: number | null }) => void;
}) {
  const c = useThemeColors();
  const [trackWidth, setTrackWidth] = useState(0);

  const lo = min ?? 0;
  const hi = max ?? MAX;

  // Live state for the pan handlers (which are created once).
  const stateRef = useRef({ lo, hi, width: 0, onChange });
  stateRef.current = { lo, hi, width: trackWidth, onChange };
  const dragStartRef = useRef(0);

  const usable = () => Math.max(1, stateRef.current.width - THUMB);
  const xFor = (value: number) =>
    (value / MAX) * Math.max(1, trackWidth - THUMB);

  function onLayout(e: LayoutChangeEvent) {
    setTrackWidth(e.nativeEvent.layout.width);
  }

  const responders = useRef(
    (["lo", "hi"] as const).map((which) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStartRef.current =
            which === "lo" ? stateRef.current.lo : stateRef.current.hi;
        },
        onPanResponderMove: (_evt, gesture) => {
          const s = stateRef.current;
          const deltaValue = (gesture.dx / usable()) * MAX;
          const raw = snap(dragStartRef.current + deltaValue);
          if (which === "lo") {
            const next = Math.min(s.hi - STEP, Math.max(0, raw));
            s.onChange({
              min: next <= 0 ? null : next,
              max: s.hi >= MAX ? null : s.hi,
            });
          } else {
            const next = Math.max(s.lo + STEP, Math.min(MAX, raw));
            s.onChange({
              min: s.lo <= 0 ? null : s.lo,
              max: next >= ANY_THRESHOLD ? null : next,
            });
          }
        },
      }),
    ),
  ).current;
  const [loResponder, hiResponder] = responders;

  const loX = xFor(lo);
  const hiX = xFor(hi);

  return (
    <View className="gap-2">
      <View className="flex-row justify-between">
        <AppText variant="caption">GHS {lo}</AppText>
        <AppText variant="caption">
          {hi >= ANY_THRESHOLD ? "Any" : `GHS ${hi}`}
        </AppText>
      </View>

      <View
        className="h-8 justify-center"
        onLayout={onLayout}
        accessibilityRole="adjustable"
        accessibilityLabel="Price range"
        accessibilityValue={{
          text: `GHS ${lo} to ${hi >= ANY_THRESHOLD ? "any" : `GHS ${hi}`}`,
        }}
      >
        {/* rail */}
        <View
          className="h-1.5 rounded-full"
          style={{ backgroundColor: c.border }}
        />
        {/* active segment */}
        <View
          className="absolute h-1.5 rounded-full"
          style={{
            left: loX + THUMB / 2,
            width: Math.max(0, hiX - loX),
            backgroundColor: c.primary,
          }}
        />
        {/* lo thumb */}
        <View
          {...loResponder.panHandlers}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{
            position: "absolute",
            left: loX,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: c.primary,
            borderWidth: 3,
            borderColor: c.background,
          }}
        />
        {/* hi thumb */}
        <View
          {...hiResponder.panHandlers}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{
            position: "absolute",
            left: hiX,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: c.primary,
            borderWidth: 3,
            borderColor: c.background,
          }}
        />
      </View>
    </View>
  );
}
