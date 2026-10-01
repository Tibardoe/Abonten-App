import Svg, { G, Path } from "react-native-svg";
import { useTranslations } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";
import { brandColors } from "../theme/tokens";
import { BRAND_MARK, type BrandArtwork } from "./brandPaths";

// The Abonten mark: a constructed A with a mint blade cut through it at 43°
// (the 2026-09 identity; masters in apps/web/public/assets/images/brand).
// It is drawn in three weights and the size picks one, so thin details never
// fall below a pixel: Hero ≥ 64 px, Small 25–63 px, Micro ≤ 24 px. The body
// takes the theme foreground; the blade takes the brand mint (the deeper mint
// on light grounds, where the bright one is too faint).

export type AbontenLogoProps = {
  /** Rendered width in px; the mark is square. */
  size?: number;
  /** Override the body colour (defaults to the theme foreground). */
  color?: string;
  /** Override the blade colour (defaults to the theme's brand mint). */
  cutColor?: string;
};

/** The weight of the mark to draw at a given pixel size. */
export function markForSize(size: number): BrandArtwork {
  if (size >= 64) return BRAND_MARK.hero;
  if (size > 24) return BRAND_MARK.small;
  return BRAND_MARK.micro;
}

/** Renders brand artwork parts in two colours; shared by the logo, the wordmark and the splash. */
export function BrandArtworkPaths({
  artwork,
  fg,
  cut,
}: {
  artwork: BrandArtwork;
  fg: string;
  cut: string;
}) {
  return (
    <>
      {artwork.parts.map((p) => (
        <G
          key={`${p.tx},${p.ty},${p.d.slice(0, 24)}`}
          transform={p.tx || p.ty ? `translate(${p.tx} ${p.ty})` : undefined}
        >
          <Path
            d={p.d}
            fill={p.role === "cut" ? cut : fg}
            fillRule={p.evenOdd ? "evenodd" : "nonzero"}
          />
        </G>
      ))}
    </>
  );
}

export function AbontenLogo({ size = 28, color, cutColor }: AbontenLogoProps) {
  const t = useTranslations("common");

  const { colors, scheme } = useTheme();
  const artwork = markForSize(size);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={artwork.viewBox}
      accessibilityRole="image"
      accessibilityLabel={t("abonten")}
    >
      <BrandArtworkPaths
        artwork={artwork}
        fg={color ?? colors.foreground}
        cut={
          cutColor ??
          (scheme === "dark" ? brandColors.mint : brandColors.mintDeep)
        }
      />
    </Svg>
  );
}
