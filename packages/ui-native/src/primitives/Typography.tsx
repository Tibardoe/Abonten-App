import {
  Text as RNText,
  type TextProps as RNTextProps,
  StyleSheet,
} from "react-native";
import { family } from "../theme/tokens";

// Native echo of apps/web/src/components/ui/typography.tsx. Same role names
// (PageTitle / SectionTitle / CardTitle / SupportingText …) so a screen ported
// from web keeps the same visual hierarchy. `AppText` is the base every other
// text component and screen should use instead of a bare <Text> — it applies
// the brand font family (Euclid Circular B, see theme/tokens.ts) and a sensible
// default colour token.

type Variant =
  | "hero"
  | "pageTitle"
  | "screenTitle"
  | "sectionTitle"
  | "cardTitle"
  | "body"
  | "bodyStrong"
  | "small"
  | "muted"
  | "label"
  | "overline"
  | "caption";

const VARIANT_CLASS: Record<Variant, string> = {
  // Big screen / flow header — one step above pageTitle, tight tracking.
  hero: "text-[28px] leading-[34px] font-bold tracking-[-0.4px] text-foreground",
  // Web PageTitle: text-2xl/3xl font-bold. Screen headers.
  pageTitle:
    "text-[24px] leading-[31px] font-bold tracking-[-0.2px] text-foreground",
  screenTitle:
    "text-[20px] leading-[27px] font-bold tracking-[-0.2px] text-foreground",
  // Web SectionTitle: text-lg/xl font-semibold.
  sectionTitle: "text-[18px] leading-[25px] font-semibold text-foreground",
  cardTitle: "text-[15px] leading-[21px] font-semibold text-foreground",
  body: "text-[15px] leading-[22px] text-foreground",
  bodyStrong: "text-[15px] leading-[22px] font-semibold text-foreground",
  small: "text-[13px] leading-[19px] text-foreground",
  // Web SupportingText: text-sm text-muted-foreground.
  muted: "text-[13px] leading-[19px] text-muted-foreground",
  label: "text-[12px] leading-[16px] font-semibold text-muted-foreground",
  // ALL-CAPS section kicker (replaces hand-rolled uppercase+tracking spans).
  overline:
    "text-[11px] leading-[14px] font-semibold uppercase tracking-[1px] text-muted-foreground",
  caption: "text-[12px] leading-[16px] text-muted-foreground",
};

// The weight each variant bakes in via its className (font-bold / font-semibold).
const VARIANT_WEIGHT: Record<Variant, string> = {
  hero: "700",
  pageTitle: "700",
  screenTitle: "700",
  sectionTitle: "600",
  cardTitle: "600",
  body: "400",
  bodyStrong: "600",
  small: "400",
  muted: "400",
  label: "600",
  overline: "600",
  caption: "400",
};

// NativeWind applies className-derived styles after this component runs, so the
// `font-*` utility a caller passes isn't visible on `style` here — scan the
// className string for it, then fall back to the variant's baked weight, and
// let an explicit style.fontWeight win over both.
function resolveFontFamily(
  variant: Variant,
  className: string | undefined,
  style: RNTextProps["style"],
): string | undefined {
  if (!family.body) return undefined;
  const flat = StyleSheet.flatten(style) as
    | { fontWeight?: unknown }
    | undefined;
  let weight: string | undefined;
  if (flat?.fontWeight != null) {
    weight = String(flat.fontWeight);
  } else if (className) {
    if (/\bfont-bold\b/.test(className)) weight = "700";
    else if (/\bfont-semibold\b/.test(className)) weight = "600";
    else if (/\bfont-medium\b/.test(className)) weight = "500";
    else if (/\bfont-light\b/.test(className)) weight = "300";
  }
  weight = weight ?? VARIANT_WEIGHT[variant];
  return family.byWeight[weight] ?? family.body;
}

// Tailwind text-size tokens -> px, mirroring theme/tokens.ts `fontSize`.
const SIZE_TOKEN_PX: Record<string, number> = {
  "text-xs": 11,
  "text-sm": 13,
  "text-base": 15,
  "text-lg": 17,
  "text-xl": 20,
  "text-2xl": 24,
  "text-3xl": 30,
};
const NAMED_LEADING_RATIO: Record<string, number> = {
  "leading-none": 1,
  "leading-tight": 1.25,
  "leading-snug": 1.375,
  "leading-normal": 1.5,
  "leading-relaxed": 1.625,
  "leading-loose": 2,
};

function lastMatch(re: RegExp, s: string): RegExpMatchArray | null {
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  const g = new RegExp(re.source, "g");
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex scan
  while ((m = g.exec(s)) !== null) last = m;
  return last;
}

// Android renders custom .ttf faces (Euclid Circular B) with extra font
// padding and, when a caller overrides `text-[Npx]` without a matching
// `leading-*`, the variant's own (now-too-small) line height stays and
// clips ascenders/descenders. This derives a safe line height from the
// *effective* font size whenever the resolved leading would be too tight,
// and drops Android's font padding so button/label text sits centred.
// An explicit `style.lineHeight` always wins.
function resolveTextMetrics(
  combinedClassName: string,
  style: RNTextProps["style"],
): {
  lineHeight?: number;
  includeFontPadding: boolean;
  textAlignVertical: "center";
} {
  const flat = StyleSheet.flatten(style) as
    | { lineHeight?: unknown; fontSize?: unknown }
    | undefined;
  const base = {
    includeFontPadding: false,
    textAlignVertical: "center" as const,
  };
  if (typeof flat?.lineHeight === "number") return base;

  let size: number | undefined;
  if (typeof flat?.fontSize === "number") size = flat.fontSize;
  const arbSize = lastMatch(/text-\[(\d+(?:\.\d+)?)px\]/, combinedClassName);
  const tokenSize = lastMatch(
    /\btext-(xs|sm|base|lg|xl|2xl|3xl)\b/,
    combinedClassName,
  );
  if (arbSize) size = Number.parseFloat(arbSize[1]);
  else if (!size && tokenSize) size = SIZE_TOKEN_PX[`text-${tokenSize[1]}`];
  if (!size) return base;

  let leading: number | undefined;
  const arbLeading = lastMatch(
    /leading-\[(\d+(?:\.\d+)?)px\]/,
    combinedClassName,
  );
  const namedLeading = lastMatch(
    /\bleading-(none|tight|snug|normal|relaxed|loose)\b/,
    combinedClassName,
  );
  if (arbLeading) leading = Number.parseFloat(arbLeading[1]);
  else if (namedLeading)
    leading = size * NAMED_LEADING_RATIO[`leading-${namedLeading[1]}`];

  const ratio = size >= 20 ? 1.3 : 1.4;
  const safe = Math.round(size * ratio);
  // Only step in when the resolved leading is missing or tight enough to clip.
  if (leading == null || leading < size * 1.15) {
    return { ...base, lineHeight: safe };
  }
  return base;
}

export type AppTextProps = RNTextProps & {
  variant?: Variant;
  className?: string;
};

export function AppText({
  variant = "body",
  className,
  style,
  ...rest
}: AppTextProps) {
  const combined = `${VARIANT_CLASS[variant]}${className ? ` ${className}` : ""}`;
  const fontFamily = resolveFontFamily(variant, className, style);
  const metrics = resolveTextMetrics(combined, style);
  return (
    <RNText
      className={combined}
      style={[metrics, fontFamily ? { fontFamily } : null, style]}
      {...rest}
    />
  );
}

const make = (variant: Variant) => {
  function Component({ className, ...rest }: Omit<AppTextProps, "variant">) {
    return <AppText variant={variant} className={className} {...rest} />;
  }
  Component.displayName = variant;
  return Component;
};

export const Hero = make("hero");
export const PageTitle = make("pageTitle");
export const ScreenTitle = make("screenTitle");
export const Overline = make("overline");
export const SectionTitle = make("sectionTitle");
export const CardTitle = make("cardTitle");
export const Body = make("body");
export const BodyStrong = make("bodyStrong");
export const SmallText = make("small");
export const Muted = make("muted");
export const Label = make("label");
export const Caption = make("caption");
