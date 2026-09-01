import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  View,
} from "react-native";
import { useThemeColors } from "../theme/ThemeProvider";
import { Icon, type IoniconName } from "./Icon";
import { AppText } from "./Typography";

// Native echo of apps/web/src/components/ui/button.tsx (shadcn "new-york").
// Same variant names + a size scale, so a ported screen keeps its buttons.

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

const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-2 rounded-md",
  md: "px-4 py-3 rounded-lg",
  lg: "px-5 py-4 rounded-xl",
};

const LABEL_SIZE: Record<ButtonSize, string> = {
  sm: "text-[13px]",
  md: "text-[15px]",
  lg: "text-[16px]",
};

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: IoniconName;
  rightIcon?: IoniconName;
  className?: string;
};

export function Button({
  title,
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
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

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={[
        "flex-row items-center justify-center gap-2 active:opacity-80",
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
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <View className="flex-row items-center gap-2">
          {leftIcon ? <Icon name={leftIcon} size={16} tone={iconTone} /> : null}
          <AppText
            className={`${LABEL[variant]} ${LABEL_SIZE[size]} font-semibold`}
          >
            {title}
          </AppText>
          {rightIcon ? (
            <Icon name={rightIcon} size={16} tone={iconTone} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
