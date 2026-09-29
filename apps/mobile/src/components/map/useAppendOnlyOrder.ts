import { type ReactElement, useRef } from "react";

// react-native-maps 1.27 (Android) keeps a map's markers in a list that it
// updates with `set(index)` instead of `add(index)` (MapView.java,
// safeAddFeature). A marker inserted anywhere but the END therefore
// overwrites the marker already in that slot: the overwritten one stays on
// the map for good — a ghost pin nothing can remove — and every later
// removal hits the wrong marker. Seen on the emulator after zooming into a
// cluster: its two pins were inserted where the bubble had been, and a
// deselected pin's halo stayed up and could not be cleared.
//
// So the map's children are rendered in the order each key first appeared:
// markers that stay never move, removals line up with the list, and anything
// new is always appended at the end. Drawing order is set by zIndex, so the
// child order itself doesn't show.
export function useAppendOnlyOrder() {
  const seen = useRef({ next: 0, order: new Map<string, number>() });
  return (children: ReactElement[]): ReactElement[] => {
    const { order } = seen.current;
    const keys = new Set(children.map((c) => String(c.key)));
    for (const k of [...order.keys()]) if (!keys.has(k)) order.delete(k);
    for (const k of keys) {
      if (!order.has(k)) order.set(k, seen.current.next++);
    }
    return [...children].sort(
      (a, b) =>
        (order.get(String(a.key)) ?? 0) - (order.get(String(b.key)) ?? 0),
    );
  };
}
