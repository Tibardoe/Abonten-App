import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// Whether the OS "reduce motion" accessibility setting is on. Every motion
// primitive in this package reads it and falls back to an instant state
// change when it's true, so a user who has asked the system for less motion
// never has to opt out again per-screen.
//
// One module-level listener, not one per component. PressableScale is on
// every card in every list, so a per-hook AccessibilityInfo subscription
// would mean dozens of native listeners on a scrolling feed; instead the
// module subscribes once, lazily, and fans the value out to whoever is
// mounted.

let current = false;
let started = false;
const subscribers = new Set<(v: boolean) => void>();

function publish(v: boolean) {
  if (v === current) return;
  current = v;
  for (const fn of subscribers) fn(v);
}

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then(publish)
    .catch(() => {});
  AccessibilityInfo.addEventListener("reduceMotionChanged", publish);
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(current);

  useEffect(() => {
    start();
    // Catch the value if it resolved between render and this effect.
    setReduced(current);
    subscribers.add(setReduced);
    return () => {
      subscribers.delete(setReduced);
    };
  }, []);

  return reduced;
}
