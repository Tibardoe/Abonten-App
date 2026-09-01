// Euclid Circular B — the web brand face. apps/web/src/app/fonts.ts loads the
// same five weights via next/font/local from apps/web/public/fonts/*.woff2;
// the .ttf files under apps/mobile/assets/fonts were converted from those.
// Loaded once at the app root (app/_layout.tsx); every text style resolves
// its face through @abonten/ui-native's AppText (see theme/tokens.ts `family`).
export const euclidFonts = {
  "EuclidCircularB-Light": require("../../assets/fonts/Euclid-Circular-B-Light.ttf"),
  "EuclidCircularB-Regular": require("../../assets/fonts/Euclid-Circular-B-Regular.ttf"),
  "EuclidCircularB-Medium": require("../../assets/fonts/Euclid-Circular-B-Medium.ttf"),
  "EuclidCircularB-SemiBold": require("../../assets/fonts/Euclid-Circular-B-SemiBold.ttf"),
  "EuclidCircularB-Bold": require("../../assets/fonts/Euclid-Circular-B-Bold.ttf"),
} as const;
