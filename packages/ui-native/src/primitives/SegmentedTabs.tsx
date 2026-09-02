import { Pressable, View } from "react-native";
import { shadow } from "../theme/tokens";
import { AppText } from "./Typography";

// Native echo of the web shadcn <Tabs>/<TabsList>/<TabsTrigger> segmented
// control (apps/web/src/components/ui/tabs.tsx): a rounded `bg-muted`
// track with equal-width triggers; the active trigger lifts onto a
// `bg-accent` surface with a card shadow, inactive labels stay
// `text-muted-foreground`. Used for the Explore Events/Places switch, the
// profile tab bar, the Tickets tab strip, and the Favorites sub-tabs so
// every tab control in the app reads the same as the web one.

export type SegmentedTabOption<T extends string> = {
  key: T;
  label: string;
};

export type SegmentedTabsProps<T extends string> = {
  options: SegmentedTabOption<T>[];
  value: T;
  onChange: (key: T) => void;
  /** Extra classes on the track (e.g. margins). */
  className?: string;
};

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedTabsProps<T>) {
  return (
    <View
      accessibilityRole="tablist"
      className={[
        "h-11 flex-row items-center rounded-lg bg-muted p-1",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.key)}
            className={`h-full flex-1 items-center justify-center rounded-md px-3 ${
              active ? "bg-accent" : ""
            } active:opacity-80`}
            style={active ? shadow.card : undefined}
          >
            <AppText
              numberOfLines={1}
              className={`text-[13px] font-medium ${
                active ? "text-accent-foreground" : "text-muted-foreground"
              }`}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
