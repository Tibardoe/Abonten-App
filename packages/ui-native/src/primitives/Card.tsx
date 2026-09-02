import {
  Pressable,
  type PressableProps,
  View,
  type ViewProps,
} from "react-native";
import { shadow } from "../theme/tokens";
import { Icon, type IoniconName } from "./Icon";
import { AppText } from "./Typography";

// Native echo of the `bg-card border border-border rounded-xl` block that
// repeats on every web screen, plus the icon + label + sub "detail row" that
// the event / place / ticket detail pages are built from.

export type CardProps = ViewProps & {
  className?: string;
  padded?: boolean;
  /** Adds a soft drop shadow (light mode) — the border still carries it in dark. */
  elevated?: boolean;
};

export function Card({
  className,
  padded = true,
  elevated = false,
  children,
  style,
  ...rest
}: CardProps) {
  return (
    <View
      className={[
        "rounded-2xl border border-border bg-card",
        padded ? "p-4" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={elevated ? [shadow.card, style] : style}
      {...rest}
    >
      {children}
    </View>
  );
}

export type PressableCardProps = Omit<PressableProps, "style"> & {
  className?: string;
};

export function PressableCard({
  className,
  children,
  ...rest
}: PressableCardProps) {
  return (
    <Pressable
      className={[
        "overflow-hidden rounded-2xl border border-border bg-card active:opacity-90",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

export type CardRowProps = {
  icon: IoniconName;
  label: string;
  sub?: string;
  className?: string;
};

/** icon + primary line + optional secondary line — the detail-page row. */
export function CardRow({ icon, label, sub, className }: CardRowProps) {
  return (
    <View
      className={["flex-row gap-3", className ?? ""].filter(Boolean).join(" ")}
    >
      <Icon name={icon} size={18} tone="muted" style={{ marginTop: 2 }} />
      <View className="flex-1">
        <AppText variant="body">{label}</AppText>
        {sub ? (
          <AppText variant="caption" className="mt-0.5">
            {sub}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
