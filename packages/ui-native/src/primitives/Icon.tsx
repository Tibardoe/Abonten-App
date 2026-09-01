import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useThemeColors } from "../theme/ThemeProvider";

// One icon set for the whole native app (Ionicons, already bundled via
// @expo/vector-icons), with the colour defaulting to a theme token instead
// of the hard-coded "#888" / "#999" hex values scattered through the
// screens today. Pass `tone` for a semantic colour or `color` for an exact
// one.

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type IconTone =
  | "foreground"
  | "muted"
  | "primary"
  | "destructive"
  | "success"
  | "warning"
  | "inverse";

export type IconProps = {
  name: IoniconName;
  size?: number;
  tone?: IconTone;
  color?: string;
  style?: ComponentProps<typeof Ionicons>["style"];
};

export function Icon({
  name,
  size = 18,
  tone = "muted",
  color,
  style,
}: IconProps) {
  const c = useThemeColors();
  const toneColor: Record<IconTone, string> = {
    foreground: c.foreground,
    muted: c["muted-foreground"],
    primary: c.primary,
    destructive: c.destructive,
    success: c.success,
    warning: c.warning,
    inverse: c["primary-foreground"],
  };
  return (
    <Ionicons
      name={name}
      size={size}
      color={color ?? toneColor[tone]}
      style={style}
    />
  );
}

export type { IoniconName };
