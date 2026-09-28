import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

// The bottom-tab glyphs: one drawn family on a 24-unit grid (1.8 strokes,
// round joins) so the five tabs match each other, with a filled form for
// the selected tab. Drawn here rather than taken from an icon font so iOS
// and Android show the same shapes and nothing waits on a font to load.

type Props = { focused: boolean; color: ColorValue; size: number };

const STROKE = 1.8;

const HOUSE =
  "M4.5 10.2L12 4l7.5 6.2v8.3a2 2 0 0 1-2 2h-3v-5a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1v5h-3a2 2 0 0 1-2-2z";

export function HomeTabIcon({ focused, color, size }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={HOUSE}
        fill={focused ? color : "none"}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SearchTabIcon({ focused, color, size }: Props) {
  const width = focused ? 2.6 : STROKE;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle
        cx={10.5}
        cy={10.5}
        r={focused ? 6 : 6.25}
        fill="none"
        stroke={color}
        strokeWidth={width}
      />
      <Path
        d={focused ? "M15.2 15.2L19.8 19.8" : "M15.25 15.25L20 20"}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// A portrait frame with a play mark: short vertical video, not a generic
// media player.
export function SpotlightTabIcon({ focused, color, size }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {focused ? (
        <Path
          fillRule="evenodd"
          fill={color}
          d="M9.25 1.85h5.5A5.15 5.15 0 0 1 19.9 7v10a5.15 5.15 0 0 1-5.15 5.15h-5.5A5.15 5.15 0 0 1 4.1 17V7a5.15 5.15 0 0 1 5.15-5.15zM10.1 8.7v6.6c0 .5.55.8.98.55l5.6-3.3a.64.64 0 0 0 0-1.1l-5.6-3.3a.64.64 0 0 0-.98.55z"
        />
      ) : (
        <>
          <Rect
            x={5}
            y={2.75}
            width={14}
            height={18.5}
            rx={4.25}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
          />
          <Path
            d="M10.4 9.3l4.3 2.45a.3.3 0 0 1 0 .5l-4.3 2.45a.3.3 0 0 1-.45-.26V9.56a.3.3 0 0 1 .45-.26z"
            fill={color}
            stroke={color}
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </>
      )}
    </Svg>
  );
}

// A round speech bubble with its tail at the lower left.
export function MessagesTabIcon({ focused, color, size }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {focused ? (
        <Path
          fill={color}
          d="M12 3a9 9 0 0 1 0 18 9 9 0 0 1-3.88-.88l-3.58 1.02a1.1 1.1 0 0 1-1.36-1.36l1.02-3.58A9 9 0 0 1 12 3z"
        />
      ) : (
        <Path
          d="M12 3.9a8.1 8.1 0 0 1 0 16.2 8.1 8.1 0 0 1-3.72-.9l-3.6 1.02a.45.45 0 0 1-.55-.55l1.02-3.6A8.1 8.1 0 0 1 12 3.9z"
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}

export function AccountTabIcon({ focused, color, size }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {focused ? (
        <>
          <Circle cx={12} cy={8.1} r={4.6} fill={color} />
          <Path
            d="M4.05 20.1c.7-4.05 4.02-6.5 7.95-6.5s7.25 2.45 7.95 6.5a.95.95 0 0 1-.94 1.1H5a.95.95 0 0 1-.94-1.1z"
            fill={color}
          />
        </>
      ) : (
        <>
          <Circle
            cx={12}
            cy={8.1}
            r={3.85}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
          />
          <Path
            d="M4.9 20.25c.65-3.55 3.55-5.75 7.1-5.75s6.45 2.2 7.1 5.75"
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        </>
      )}
    </Svg>
  );
}
