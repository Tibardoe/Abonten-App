import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

// Bottom-weighted dark gradient over a card's cover photo, so a price /
// rating pill and any overlaid text stay legible on light images. Same
// technique as FeaturedEventBanner's Scrim (react-native-svg — already a
// dependency), pulled out so EventCard and PlaceCard share one definition.

const INK = "#0b1116";

export function CardImageScrim() {
  return (
    <Svg
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      width="100%"
      height="100%"
    >
      <Defs>
        <LinearGradient id="card-scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={INK} stopOpacity="0" />
          <Stop offset="0.6" stopColor={INK} stopOpacity="0" />
          <Stop offset="1" stopColor={INK} stopOpacity="0.6" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#card-scrim)" />
    </Svg>
  );
}
