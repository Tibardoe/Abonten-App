import { useCallback, useRef } from "react";
import type { View } from "react-native";
import type { Rect } from "./menuPlacement";

// Attach `ref` to the pressable surface; call `measure()` from a long-press
// handler to get its window rect for the contextual overlay. measureInWindow
// gives coordinates relative to the whole window (what an absolutely
// positioned Modal child needs), unlike `measure()` which is relative to the
// nearest ancestor.
export function useAnchorMeasure() {
  const ref = useRef<View>(null);

  const measure = useCallback(
    () =>
      new Promise<Rect | null>((resolve) => {
        const node = ref.current;
        if (!node) return resolve(null);
        node.measureInWindow((x, y, width, height) => {
          if (
            [x, y, width, height].some((n) => typeof n !== "number") ||
            width <= 0
          ) {
            return resolve(null);
          }
          resolve({ x, y, width, height });
        });
      }),
    [],
  );

  return { ref, measure };
}
