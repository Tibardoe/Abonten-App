import { ActivityIndicator, type PressableProps, View } from "react-native";
import { useThemeColors } from "../theme/ThemeProvider";
import { Icon, type IoniconName } from "./Icon";
import { PressableScale } from "./PressableScale";
import { AppText } from "./Typography";

// Native echo of apps/web/src/components/ui/button.tsx (shadcn "new-york").
// Same variant names + a size scale, so a ported screen keeps its buttons.
//
// Interaction contract (the app-wide standard for a tappable action):
//   • touch-down  — the button dips ~4% on the native driver, instantly,
//                   even if the JS thread is busy. Optional haptic.
//   • working     — `loading` shows a spinner *beside the label*, never
//                   instead of it: the width stays put (no layout jump) and
//                   the label can say what is happening ("Publishing…").
//                   Presses are blocked, so an action can't be fired twice.
//   • disabled    — 50% opacity + `accessibilityState.disabled`, so the
//                   state is legible to sighted users and to a screen
//                   reader, not colour alone.

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const CONTAINER: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  outline: "border border-border bg-transparent",
  ghost: "bg-transparent",
  destructive: "bg-destructive",
};

const LABEL: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  outline: "text-foreground",
  ghost: "text-foreground",
  destructive: "text-destructive-foreground",
};

// min-h keeps every button at (or above) a comfortable tap target even
// when the label's line box is short.
const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-[40px] px-3.5 py-2 rounded-lg",
  md: "min-h-[48px] px-4 py-3 rounded-xl",
  lg: "min-h-[52px] px-5 py-3.5 rounded-2xl",
};

const LABEL_SIZE: Record<ButtonSize, string> = {
  sm: "text-[14px]",
  md: "text-[15px]",
  lg: "text-[16px]",
};

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Label to show while `loading`. Defaults to `title`. Prefer a present
   *  participle that names the work — "Publishing…", "Uploading photos…". */
  loadingTitle?: string;
  fullWidth?: boolean;
  leftIcon?: IoniconName;
  rightIcon?: IoniconName;
  /** Selection haptic on touch-down. On by default for primary/destructive. */
  haptic?: boolean;
  className?: string;
};

export function Button({
  title,
  variant = "primary",
  size = "md",
  loading = false,
  loadingTitle,
  fullWidth = false,
  leftIcon,
  rightIcon,
  haptic,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const c = useThemeColors();
  const isDisabled = disabled || loading;
  const spinnerColor =
    variant === "primary"
      ? c["primary-foreground"]
      : variant === "destructive"
        ? c["destructive-foreground"]
        : c.foreground;
  const iconTone =
    variant === "primary"
      ? "inverse"
      : variant === "destructive"
        ? "inverse"
        : "foreground";
  const label = loading ? (loadingTitle ?? title) : title;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      accessibilityLabel={label}
      disabled={isDisabled}
      activeScale={0.96}
      haptic={haptic ?? (variant === "primary" || variant === "destructive")}
      className={[
        "flex-row items-center justify-center gap-2 active:opacity-90",
        SIZE[size],
        CONTAINER[variant],
        fullWidth ? "w-full" : "",
        isDisabled ? "opacity-50" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      <View className="flex-row items-center gap-2">
        {loading ? (
          <ActivityIndicator size="small" color={spinnerColor} />
        ) : leftIcon ? (
          <Icon name={leftIcon} size={16} tone={iconTone} />
        ) : null}
        <AppText
          className={`${LABEL[variant]} ${LABEL_SIZE[size]} font-semibold`}
        >
          {label}
        </AppText>
        {rightIcon && !loading ? (
          <Icon name={rightIcon} size={16} tone={iconTone} />
        ) : null}
      </View>
    </PressableScale>
  );
}
