import { AppText } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useRef, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

// Dual-thumb price range slider — the native stand-in for the web
// PriceRangeSlider. No slider dependency: two thumbs, each driven by its own
// react-native-gesture-handler Pan. `.activeOffsetX` + `.failOffsetY` make a
// vertical / diagonal drag *fail* the thumb pan so the parent sheet scrolls
// instead — the old PanResponder claimed every touch-move unconditionally,
// which is what made the filter modal scroll while you dragged the slider.
//
// Domain 0..MAX; a max at/above ANY_THRESHOLD reads as "Any" and reports
// null (matches exploreFilters' PRICE_ANY_MAX / the web [0, 999] sentinel).

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

  // Live values for the gesture callbacks.
  const stateRef = useRef({ lo, hi, width: 0, onChange });
  stateRef.current = { lo, hi, width: trackWidth, onChange };
  const dragStartRef = useRef(0);

  const usable = () => Math.max(1, stateRef.current.width - THUMB);
  const xFor = (value: number) => (value / MAX) * usable();

  function onLayout(e: LayoutChangeEvent) {
    setTrackWidth(e.nativeEvent.layout.width);
  }

  function makePan(which: "lo" | "hi") {
    return Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-14, 14])
      .shouldCancelWhenOutside(false)
      .runOnJS(true)
      .onBegin(() => {
        dragStartRef.current =
          which === "lo" ? stateRef.current.lo : stateRef.current.hi;
      })
      .onUpdate((e) => {
        const s = stateRef.current;
        const deltaValue = (e.translationX / usable()) * MAX;
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
      });
  }

  const loPan = useRef(makePan("lo")).current;
  const hiPan = useRef(makePan("hi")).current;

  const loX = xFor(lo);
  const hiX = xFor(hi);

  const thumbStyle = {
    position: "absolute" as const,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: c.primary,
    borderWidth: 3,
    borderColor: c.background,
  };

  return (
    <View className="gap-2">
      <View className="flex-row justify-between">
        <AppText variant="metaStrong">GHS {lo}</AppText>
        <AppText variant="metaStrong">
          {hi >= ANY_THRESHOLD ? "Any" : `GHS ${hi}`}
        </AppText>
      </View>

      <View
        className="h-9 justify-center"
        onLayout={onLayout}
        accessibilityRole="adjustable"
        accessibilityLabel="Price range"
        accessibilityValue={{
          text: `GHS ${lo} to ${hi >= ANY_THRESHOLD ? "any" : `GHS ${hi}`}`,
        }}
      >
        <View
          className="h-1.5 rounded-full"
          style={{ backgroundColor: c.border }}
        />
        <View
          className="absolute h-1.5 rounded-full"
          style={{
            left: loX + THUMB / 2,
            width: Math.max(0, hiX - loX),
            backgroundColor: c.primary,
          }}
        />
        <GestureDetector gesture={loPan}>
          <View
            hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
            style={[thumbStyle, { left: loX }]}
          />
        </GestureDetector>
        <GestureDetector gesture={hiPan}>
          <View
            hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
            style={[thumbStyle, { left: hiX }]}
          />
        </GestureDetector>
      </View>
    </View>
  );
}
