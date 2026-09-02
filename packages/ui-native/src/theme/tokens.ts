// Concrete design-token scales for the native app. Colours come from
// @abonten/ui-tokens (the same source the web Tailwind config and
// apps/mobile/global.css use); the scales below mirror the spacing / type /
// radius rhythm the web app gets from Tailwind's defaults so a screen built
// here lines up with its web counterpart.

import {
  type ColorScheme,
  type SemanticColorName,
  brandColors,
  resolveScheme,
} from "@abonten/ui-tokens/palette";

export { brandColors, resolveScheme };
export type { ColorScheme, SemanticColorName };

/** Resolved `hsl(...)` colour map for a scheme, plus the literal brand hues. */
export type ThemeColors = Record<SemanticColorName, string> & {
  mint: string;
  iconGray: string;
};

export function themeColors(scheme: ColorScheme): ThemeColors {
  return { ...resolveScheme(scheme), ...brandColors };
}

/** 4px base spacing scale — matches Tailwind's `space` keys used on web. */
export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** `--radius` is 0.5rem (8px) on web; sm/md/lg mirror tailwind.config radiusScale. */
export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  "2xl": 16,
  full: 9999,
} as const;

/** Type ramp mirroring the web `ui/typography.tsx` roles + Tailwind sizes. */
export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
} as const;

export const lineHeight = {
  xs: 16,
  sm: 18,
  base: 22,
  lg: 24,
  xl: 28,
  "2xl": 30,
  "3xl": 36,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

// Euclid Circular B is the web brand face (apps/web/src/app/fonts.ts loads the
// same five weights via next/font/local). The mobile app bundles .ttf versions
// under apps/mobile/assets/fonts and registers them by these exact names in
// app/_layout.tsx (`useFonts(euclidFonts)`). `AppText` is the single chokepoint
// that maps a text style's weight to the matching face; `body` is the regular
// fallback for anything that doesn't specify a weight. If the app root ever
// stops loading these, set the values back to `undefined` and text falls back
// to the platform system font.
export const family = {
  body: "EuclidCircularB-Regular" as string | undefined,
  /** fontWeight (as a string) → registered face name. */
  byWeight: {
    "300": "EuclidCircularB-Light",
    "400": "EuclidCircularB-Regular",
    "500": "EuclidCircularB-Medium",
    "600": "EuclidCircularB-SemiBold",
    "700": "EuclidCircularB-Bold",
    normal: "EuclidCircularB-Regular",
    bold: "EuclidCircularB-Bold",
  } as Record<string, string>,
} as const;

/** Minimum comfortable tap target (px) — Material/HIG floor. */
export const touchTarget = 44;

/** Card / sheet elevation. Web uses `shadow-sm`; this is its native echo. */
export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sheet: {
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
} as const;
