import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// Whether the OS "reduce motion" accessibility setting is on. Micro-
// interactions should fall back to an instant state change when this is
// true. Seeded from the current value and kept live via the change event.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) =>
      setReduced(v),
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
