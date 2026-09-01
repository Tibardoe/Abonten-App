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
  | "pageTitle"
  | "screenTitle"
  | "sectionTitle"
  | "cardTitle"
  | "body"
  | "bodyStrong"
  | "small"
  | "muted"
  | "label"
  | "caption";

const VARIANT_CLASS: Record<Variant, string> = {
  // Web PageTitle: text-2xl/3xl font-bold. Screen headers.
  pageTitle: "text-[24px] leading-[30px] font-bold text-foreground",
  screenTitle: "text-[20px] leading-[28px] font-bold text-foreground",
  // Web SectionTitle: text-lg/xl font-semibold.
  sectionTitle: "text-[17px] leading-[24px] font-semibold text-foreground",
  cardTitle: "text-[15px] leading-[22px] font-semibold text-foreground",
  body: "text-[15px] leading-[22px] text-foreground",
  bodyStrong: "text-[15px] leading-[22px] font-semibold text-foreground",
  small: "text-[13px] leading-[18px] text-foreground",
  // Web SupportingText: text-sm text-muted-foreground.
  muted: "text-[13px] leading-[18px] text-muted-foreground",
  label:
    "text-[11px] leading-[16px] font-semibold uppercase tracking-wide text-muted-foreground",
  caption: "text-[11px] leading-[16px] text-muted-foreground",
};

// The weight each variant bakes in via its className (font-bold / font-semibold).
const VARIANT_WEIGHT: Record<Variant, string> = {
  pageTitle: "700",
  screenTitle: "700",
  sectionTitle: "600",
  cardTitle: "600",
  body: "400",
  bodyStrong: "600",
  small: "400",
  muted: "400",
  label: "600",
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
  const fontFamily = resolveFontFamily(variant, className, style);
  return (
    <RNText
      className={`${VARIANT_CLASS[variant]}${className ? ` ${className}` : ""}`}
      style={fontFamily ? [{ fontFamily }, style] : style}
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

export const PageTitle = make("pageTitle");
export const ScreenTitle = make("screenTitle");
export const SectionTitle = make("sectionTitle");
export const CardTitle = make("cardTitle");
export const Body = make("body");
export const BodyStrong = make("bodyStrong");
export const SmallText = make("small");
export const Muted = make("muted");
export const Label = make("label");
export const Caption = make("caption");
