import { type StyleProp, View, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { tintBackground, tintBorder } from "../theme/color";
import { Icon } from "./Icon";
import { AppText } from "./Typography";
import { type ResolveOptions, type StatusTone, resolveStatus } from "./status";

// The one status chip for the whole app. Give it a raw backend string and it
// renders a soft tinted pill with an icon + label — the tint is derived from
// the matching brand token (success / warning / destructive / primary /
// muted) so it tracks light & dark automatically, and the icon + wording
// carry the meaning so it never depends on colour alone (accessibility).

const TONE_TOKEN: Record<
  StatusTone,
  "success" | "warning" | "destructive" | "primary" | "muted-foreground"
> = {
  success: "success",
  warning: "warning",
  danger: "destructive",
  brand: "primary",
  neutral: "muted-foreground",
};

const ICON_TONE: Record<
  StatusTone,
  "success" | "warning" | "destructive" | "primary" | "muted"
> = {
  success: "success",
  warning: "warning",
  danger: "destructive",
  brand: "primary",
  neutral: "muted",
};

export type StatusPillProps = {
  /** Raw backend status string — resolved via the shared registry. */
  status: string | null | undefined;
  /** Override the resolved label / provide a fallback kind. */
  options?: ResolveOptions;
  size?: "sm" | "md";
  /** Hide the leading icon (dense rows). Meaning still carried by the label. */
  hideIcon?: boolean;
  /** Solid neutral surface instead of a coloured tint (e.g. on image scrims). */
  variant?: "tint" | "plain";
  style?: StyleProp<ViewStyle>;
  className?: string;
};

export function StatusPill({
  status,
  options,
  size = "md",
  hideIcon = false,
  variant = "tint",
  style,
  className,
}: StatusPillProps) {
  const { colors: c, scheme } = useTheme();
  const entry = resolveStatus(status, options);
  if (!entry.label) return null;

  const accent = c[TONE_TOKEN[entry.tone]];
  const bg = variant === "plain" ? c.muted : tintBackground(accent, scheme);
  const border = variant === "plain" ? c.border : tintBorder(accent, scheme);

  const pad = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";
  const gap = size === "sm" ? "gap-1" : "gap-1.5";
  const textSize = size === "sm" ? "text-[11px]" : "text-[12px]";
  const iconSize = size === "sm" ? 11 : 13;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Status: ${entry.label}`}
      className={`flex-row items-center self-start rounded-full border ${pad} ${gap} ${className ?? ""}`}
      style={[{ backgroundColor: bg, borderColor: border }, style]}
    >
      {hideIcon ? null : (
        <Icon name={entry.icon} size={iconSize} tone={ICON_TONE[entry.tone]} />
      )}
      <AppText
        className={`${textSize} font-semibold`}
        style={{
          color:
            entry.tone === "neutral"
              ? c["muted-foreground"]
              : c[TONE_TOKEN[entry.tone]],
        }}
      >
        {entry.label}
      </AppText>
    </View>
  );
}
