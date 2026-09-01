import { Pressable, View } from "react-native";
import { AppText } from "./Typography";

// The selectable pill used everywhere on web for quick filters, category
// chips, momo-network pickers, dashboard period switches. `selected` drives
// the primary fill; non-interactive chips (tags) just omit `onPress`.

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  className?: string;
};

export function Chip({
  label,
  selected = false,
  onPress,
  className,
}: ChipProps) {
  const body = (
    <AppText
      className={`text-[12px] ${
        selected
          ? "font-semibold text-primary-foreground"
          : "font-medium text-muted-foreground"
      }`}
    >
      {label}
    </AppText>
  );

  const box = [
    "rounded-full px-3 py-1.5",
    selected ? "bg-primary" : "border border-border bg-background",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!onPress) {
    return <View className={box}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`${box} active:opacity-80`}
    >
      {body}
    </Pressable>
  );
}

/** Non-interactive `#tag` / category chip. */
export function Tag({
  label,
  className,
}: { label: string; className?: string }) {
  return (
    <View
      className={["rounded-full bg-muted px-3 py-1", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}
