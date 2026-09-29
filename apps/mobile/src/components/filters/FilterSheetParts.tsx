import { AppText, Chip, Label } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// The building blocks of every filter sheet (Search, Explore), so they look
// and behave the same: a labelled section with an active dot and an inline
// "Clear", separated by a hairline, and a wrapping row of single-choice
// chips whose first option is the "any" state.

export function FilterSection({
  label,
  hint,
  active,
  onClear,
  first,
  children,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onClear: () => void;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className={first ? "gap-2.5" : "gap-2.5 border-t border-border pt-5"}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Label>{label}</Label>
          {active ? (
            <View className="h-1.5 w-1.5 rounded-full bg-primary" />
          ) : null}
        </View>
        {active ? (
          <Pressable
            onPress={onClear}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            className="min-h-[32px] justify-center"
          >
            <AppText variant="caption" tone="brand" className="font-semibold">
              Clear
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {hint ? (
        <AppText variant="caption" className="-mt-1">
          {hint}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

export function FilterChoices<T>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <View
      className="flex-row flex-wrap gap-2"
      style={disabled ? { opacity: 0.45 } : undefined}
      pointerEvents={disabled ? "none" : "auto"}
      accessibilityState={{ disabled: !!disabled }}
    >
      {options.map((o) => (
        <Chip
          key={String(o.value)}
          label={o.label}
          selected={o.value === value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </View>
  );
}

/** A wrapping row for chips that don't fit FilterChoices (multi-select). */
export function FilterChipRow({ children }: { children: React.ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}
