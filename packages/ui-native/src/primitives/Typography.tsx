import {
  Text as RNText,
  type TextProps as RNTextProps,
  StyleSheet,
} from "react-native";
import { MAX_FONT_SIZE_MULTIPLIER, scaleFont } from "../theme/fontScale";
import { family } from "../theme/tokens";

// Native echo of apps/web/src/components/ui/typography.tsx. Same role names
// (PageTitle / SectionTitle / CardTitle / SupportingText …) so a screen ported
// from web keeps the same visual hierarchy. `AppText` is the base every other
// text component and screen should use instead of a bare <Text> — it applies
// the brand font family (Euclid Circular B, see theme/tokens.ts) and a sensible
// default colour token.
//
// The ramp is deliberately small and each rung has ONE job. Hierarchy is
// carried by size + weight + two colour tokens (`foreground` /
// `muted-foreground`, matching web — no third grey tier) so a glance separates
// title → primary metadata → secondary metadata → caption:
//
//   metaStrong  14 / 600 foreground        date · time · price · status
//   meta        13 / 400 muted-foreground  venue · distance · attendance
//   caption     12 / 400 muted-foreground  genuinely-tiny only
//
// A `tone` prop overrides just the colour (e.g. a warning "2 spots left"),
// without having to remember the exact `text-…` class.

type Variant =
  | "hero"
  | "pageTitle"
  | "screenTitle"
  | "sectionTitle"
  | "sectionHeading"
  | "cardTitle"
  | "body"
  | "bodyStrong"
  | "bodyLg"
  | "small"
  | "muted"
  | "label"
  | "metaStrong"
  | "meta"
  | "overline"
  | "caption";

type Tone =
  | "primary"
  | "secondary"
  | "muted"
  | "disabled"
  | "brand"
  | "success"
  | "warning"
  | "error"
  | "inverse";

// Size + leading + weight (+ case/tracking) only — NO colour. Colour is
// resolved separately from `tone` so callers can recolour a rung without
// fighting a baked-in `text-foreground`.
const VARIANT_CLASS: Record<Variant, string> = {
  // Big flow / marketing header — one step above pageTitle, tight tracking.
  hero: "text-[30px] leading-[36px] font-bold tracking-[-0.5px]",
  // Web PageTitle: text-2xl/3xl font-bold. Screen headers.
  pageTitle: "text-[26px] leading-[32px] font-bold tracking-[-0.3px]",
  screenTitle: "text-[22px] leading-[28px] font-bold tracking-[-0.2px]",
  // Web SectionTitle: text-lg/xl font-semibold — the dominant list heading.
  sectionTitle: "text-[19px] leading-[25px] font-bold",
  // Quieter group heading inside a screen (a carousel strip title used big).
  sectionHeading: "text-[16px] leading-[22px] font-bold",
  cardTitle: "text-[16px] leading-[22px] font-bold",
  body: "text-[15px] leading-[22px]",
  bodyStrong: "text-[15px] leading-[22px] font-semibold",
  // Comfortable reading size for detail-screen prose.
  bodyLg: "text-[16px] leading-[24px]",
  small: "text-[13px] leading-[19px]",
  muted: "text-[13px] leading-[19px]",
  // Form field label — primary, not muted (you need to read it to fill the form).
  label: "text-[13px] leading-[18px] font-semibold",
  // PRIMARY metadata: date, time, price, open/closed, status.
  metaStrong: "text-[14px] leading-[20px] font-semibold",
  // SECONDARY metadata: venue, distance, attendance, category.
  meta: "text-[13px] leading-[18px]",
  // ALL-CAPS section kicker (replaces hand-rolled uppercase+tracking spans).
  overline:
    "text-[12px] leading-[16px] font-semibold uppercase tracking-[0.8px]",
  caption: "text-[12px] leading-[16px]",
};

// Default colour per variant. `tone` (when passed) wins over this.
const VARIANT_TONE: Record<Variant, Tone> = {
  hero: "primary",
  pageTitle: "primary",
  screenTitle: "primary",
  sectionTitle: "primary",
  sectionHeading: "primary",
  cardTitle: "primary",
  body: "primary",
  bodyStrong: "primary",
  bodyLg: "primary",
  small: "primary",
  muted: "muted",
  label: "primary",
  metaStrong: "primary",
  meta: "muted",
  overline: "muted",
  caption: "muted",
};

const TONE_CLASS: Record<Tone, string> = {
  primary: "text-foreground",
  // Distinct from `primary` only by the caller pairing it with a lighter
  // weight — web has no middle grey and neither do we.
  secondary: "text-foreground",
  muted: "text-muted-foreground",
  disabled: "text-muted-foreground opacity-60",
  brand: "text-primary",
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
  inverse: "text-white",
};

// The weight each variant bakes in via its className (font-bold / font-semibold).
const VARIANT_WEIGHT: Record<Variant, string> = {
  hero: "700",
  pageTitle: "700",
  screenTitle: "700",
  sectionTitle: "700",
  sectionHeading: "700",
  cardTitle: "700",
  body: "400",
  bodyStrong: "600",
  bodyLg: "400",
  small: "400",
  muted: "400",
  label: "600",
  metaStrong: "600",
  meta: "400",
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

// Two jobs:
//   1. Device-responsive sizing — the authored px size (from `text-[Npx]`,
//      a `text-<token>` class, or `style.fontSize`) is run through
//      `scaleFont` so every piece of text in the app scales with the screen
//      width together, instead of each screen remembering to do it. The
//      line height keeps the authored leading:size proportion.
//   2. Android renders custom .ttf faces (Euclid Circular B) with extra
//      font padding and clips ascenders/descenders when the leading is too
//      tight; this drops that padding and floors the line height.
// An explicit `style.fontSize` / `style.lineHeight` still wins (it's applied
// after these metrics in AppText's style array) — callers who set an exact
// pixel value get exactly that.
function resolveTextMetrics(
  combinedClassName: string,
  style: RNTextProps["style"],
): {
  fontSize?: number;
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

  let size: number | undefined;
  if (typeof flat?.fontSize === "number") size = flat.fontSize;
  const arbSize = lastMatch(/text-\[(\d+(?:\.\d+)?)px\]/, combinedClassName);
  const tokenSize = lastMatch(
    /\btext-(xs|sm|base|lg|xl|2xl|3xl)\b/,
    combinedClassName,
  );
  if (arbSize) size = Number.parseFloat(arbSize[1]);
  else if (size == null && tokenSize)
    size = SIZE_TOKEN_PX[`text-${tokenSize[1]}`];
  // Nothing resolvable to scale — keep only the Android font-padding fix.
  if (size == null) return base;

  let leading: number | undefined;
  if (typeof flat?.lineHeight === "number") leading = flat.lineHeight;
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

  const scaledSize = scaleFont(size);
  // Preserve the authored leading:size ratio when it's roomy enough;
  // otherwise fall back to a safe ratio (tighter for display sizes).
  const ratio =
    leading != null && leading >= size * 1.15
      ? leading / size
      : size >= 20
        ? 1.3
        : 1.4;
  return {
    ...base,
    fontSize: scaledSize,
    lineHeight: Math.round(scaledSize * ratio),
  };
}

export type AppTextProps = RNTextProps & {
  variant?: Variant;
  /** Override just the colour of the chosen variant. */
  tone?: Tone;
  className?: string;
};

export function AppText({
  variant = "body",
  tone,
  className,
  style,
  maxFontSizeMultiplier = MAX_FONT_SIZE_MULTIPLIER,
  ...rest
}: AppTextProps) {
  const toneClass = TONE_CLASS[tone ?? VARIANT_TONE[variant]];
  const combined = `${VARIANT_CLASS[variant]} ${toneClass}${
    className ? ` ${className}` : ""
  }`;
  const fontFamily = resolveFontFamily(variant, className, style);
  const metrics = resolveTextMetrics(combined, style);
  return (
    <RNText
      className={combined}
      style={[metrics, fontFamily ? { fontFamily } : null, style]}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
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
export const SectionHeading = make("sectionHeading");
export const CardTitle = make("cardTitle");
export const Body = make("body");
export const BodyStrong = make("bodyStrong");
export const BodyLg = make("bodyLg");
export const SmallText = make("small");
export const Muted = make("muted");
export const Label = make("label");
export const MetaStrong = make("metaStrong");
export const Meta = make("meta");
export const Caption = make("caption");
