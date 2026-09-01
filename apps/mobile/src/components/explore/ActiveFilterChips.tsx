import type { FilterChip } from "@/features/discovery/exploreFilters";
import { AppText, Icon } from "@abonten/ui-native";
import { Pressable, ScrollView, View } from "react-native";

// The row of removable chips that summarises the active filters — the web
// app shows the count on the Filters button; on mobile the individual
// chips double as one-tap "remove this filter" controls, with a trailing
// "Clear all". Renders nothing when no filter is active.

export function ActiveFilterChips({
  chips,
  onRemove,
  onClearAll,
}: {
  chips: FilterChip[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-4 pb-2"
    >
      {chips.map((chip) => (
        <Pressable
          key={chip.key}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter ${chip.label}`}
          onPress={() => onRemove(chip.key)}
          className="flex-row items-center gap-1 rounded-full bg-primary px-3 py-1.5 active:opacity-80"
        >
          <AppText className="text-[12px] font-semibold text-primary-foreground">
            {chip.label}
          </AppText>
          <Icon name="close" size={13} color="#fff" />
        </Pressable>
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={onClearAll}
        className="flex-row items-center rounded-full border border-border px-3 py-1.5 active:opacity-70"
      >
        <AppText className="text-[12px] font-medium text-muted-foreground">
          Clear all
        </AppText>
      </Pressable>

      <View className="w-2" />
    </ScrollView>
  );
}
