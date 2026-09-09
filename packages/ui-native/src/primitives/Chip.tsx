import { View } from "react-native";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";
import { AppText } from "./Typography";

// The selectable pill used everywhere for quick filters, category chips,
// momo-network pickers, dashboard period switches, the date picker on Buy
// tickets. `selected` drives the primary fill; non-interactive chips (tags)
// just omit `onPress`.
//
// Visual: a soft filled pill when idle (reads as a control, not a link) and
// a solid primary fill when selected. `showCheck` adds a leading tick on the
// selected state — use it in multi-/single-select filter groups so which
// chips are on is unmistakable at a glance.
//
// Selecting a chip is a state change the user chose, so it earns a selection
// haptic and a press dip — that is what makes a filter row feel like
// switches rather than links. Both are skipped under reduce-motion / on a
// device with no taptic engine.

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Leading check on the selected state (filter groups). */
  showCheck?: boolean;
  className?: string;
};

export function Chip({
  label,
  selected = false,
  onPress,
  showCheck = false,
  className,
}: ChipProps) {
  const body = (
    <View className="flex-row items-center gap-1.5">
      {selected && showCheck ? (
        <Icon name="checkmark" size={13} tone="inverse" />
      ) : null}
      <AppText
        className={`text-[13px] ${
          selected
            ? "font-semibold text-primary-foreground"
            : "font-medium text-muted-foreground"
        }`}
      >
        {label}
      </AppText>
    </View>
  );

  const box = [
    "rounded-full px-3.5 py-2",
    selected ? "bg-primary" : "border border-border bg-muted",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!onPress) {
    return <View className={box}>{body}</View>;
  }
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      haptic
      activeScale={0.95}
      className={`${box} active:opacity-80`}
    >
      {body}
    </PressableScale>
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
      <AppText variant="meta">{label}</AppText>
    </View>
  );
}
