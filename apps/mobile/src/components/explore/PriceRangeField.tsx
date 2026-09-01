import { AppText } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useRef, useState } from "react";
import { type LayoutChangeEvent, PanResponder, View } from "react-native";

// Dual-thumb price range slider — the native stand-in for the web
// PriceRangeSlider. No dependency: two thumbs driven by PanResponder over a
// measured track. Domain 0..MAX; a max at/above ANY_THRESHOLD reads as
// "Any" and is reported as null (matches the web modal's [0, 999] "Any"
// sentinel).

const MAX = 1000;
const STEP = 10;
const ANY_THRESHOLD = 990;
const THUMB = 22;

function clampSnap(v: number, lo: number, hi: number): number {
  const snapped = Math.round(v / STEP) * STEP;
  return Math.min(hi, Math.max(lo, snapped));
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
  const widthRef = useRef(0);

  const lo = min ?? 0;
  const hi = max ?? MAX;

  const usable = Math.max(1, trackWidth - THUMB);
  const xFor = (value: number) => (value / MAX) * usable;
  const valueFor = (x: number) => (x / usable) * MAX;

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setTrackWidth(w);
  }

  const makeResponder = (which: "lo" | "hi") =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt, gesture) => {
        const w = widthRef.current;
        if (w <= 0) return;
        const usableW = Math.max(1, w - THUMB);
        const raw = valueFor(
          Math.min(usableW, Math.max(0, gesture.moveX - THUMB / 2)),
        );
        if (which === "lo") {
          const next = clampSnap(raw, 0, hi - STEP);
          onChange({ min: next <= 0 ? null : next, max });
        } else {
          const next = clampSnap(raw, lo + STEP, MAX);
          onChange({
            min,
            max: next >= ANY_THRESHOLD ? null : next,
          });
        }
      },
    });

  const loResponder = useRef(makeResponder("lo")).current;
  const hiResponder = useRef(makeResponder("hi")).current;

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

      <View className="h-6 justify-center" onLayout={onLayout}>
        {/* rail */}
        <View
          className="h-1 rounded-full"
          style={{ backgroundColor: c.border }}
        />
        {/* active segment */}
        <View
          className="absolute h-1 rounded-full"
          style={{
            left: loX + THUMB / 2,
            width: Math.max(0, hiX - loX),
            backgroundColor: c.primary,
          }}
        />
        {/* lo thumb */}
        <View
          {...loResponder.panHandlers}
          style={{
            position: "absolute",
            left: loX,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: c.primary,
            borderWidth: 2,
            borderColor: c.background,
          }}
        />
        {/* hi thumb */}
        <View
          {...hiResponder.panHandlers}
          style={{
            position: "absolute",
            left: hiX,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: c.primary,
            borderWidth: 2,
            borderColor: c.background,
          }}
        />
      </View>
    </View>
  );
}
