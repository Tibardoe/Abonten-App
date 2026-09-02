import { useWindowDimensions } from "react-native";

// Responsive width for a card in a horizontal "Around you / Happening today"
// carousel. A fixed 260px looked cramped on every phone and identical on a
// 360dp and a 430dp device; instead the card takes a fixed *fraction* of the
// viewport (like Instagram's / Airbnb's horizontal rails) so it always feels
// substantial and always leaves a peek of the next card as a scroll hint.
//
//   0.84 * width, clamped to [300, 360]
//     360dp phone -> ~302   390dp -> ~328   430dp -> 360 (clamped)
//
// The container has 16px side padding + a 12px inter-card gap, so ~28-46px of
// the next card stays visible.

const MIN = 300;
const MAX = 360;
const FRACTION = 0.84;

export function getCarouselCardWidth(windowWidth: number): number {
  return Math.round(Math.min(MAX, Math.max(MIN, windowWidth * FRACTION)));
}

/** Hook form — recomputes on rotation / split-screen resize. */
export function useCarouselCardWidth(): number {
  const { width } = useWindowDimensions();
  return getCarouselCardWidth(width);
}
