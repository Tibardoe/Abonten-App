import Svg from "react-native-svg";
import { useTranslations } from "../i18n";
import { useThemeColors } from "../theme/ThemeProvider";
import { BrandArtworkPaths } from "./AbontenLogo";
import { BRAND_WORDMARK } from "./brandPaths";

// The drawn ABƆNTEN wordmark (the Ɔ is the Twi open o — "abɔnten",
// outside). It is artwork, not text: screen readers hear "Abonten", and every
// live string in the app keeps the plain spelling. Pairs with <AbontenLogo>
// above it on the auth screens; one colour, because the mark's blade is the
// composition's one mint moment.

export type AbontenWordmarkProps = {
  /** Matches the font size it replaces: the letters are 0.8 × size tall. */
  size?: number;
  /** Override the colour (defaults to the theme foreground). */
  color?: string;
};

const viewBox = BRAND_WORDMARK.viewBox.split(" ").map(Number);
const VB_W = viewBox[2] ?? 1184;
const VB_H = viewBox[3] ?? 210;

export function AbontenWordmark({ size = 20, color }: AbontenWordmarkProps) {
  const t = useTranslations("common");

  const c = useThemeColors();
  const height = size * 0.8 * (VB_H / 200);
  const fill = color ?? c.foreground;
  return (
    <Svg
      width={(height * VB_W) / VB_H}
      height={height}
      viewBox={BRAND_WORDMARK.viewBox}
      accessibilityRole="header"
      accessibilityLabel={t("abonten")}
    >
      <BrandArtworkPaths artwork={BRAND_WORDMARK} fg={fill} cut={fill} />
    </Svg>
  );
}
