import { Chip } from "@abonten/ui-native";
import { ScrollView } from "react-native";

// Horizontal category-pill row for Explore — the native echo of the web
// EventCategoryChips / PlaceCategoryChips (both render the shared
// CategoryChipsRow). Leads with an "All" chip that clears the category.

export type CategoryChipItem = { key: string; label: string };

export function CategoryChipsRow({
  items,
  selectedKey,
  onSelect,
}: {
  items: CategoryChipItem[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-4 py-2"
    >
      <Chip
        label="All"
        selected={selectedKey == null}
        onPress={() => onSelect(null)}
      />
      {items.map((item) => (
        <Chip
          key={item.key}
          label={item.label}
          selected={selectedKey === item.key}
          onPress={() => onSelect(selectedKey === item.key ? null : item.key)}
        />
      ))}
    </ScrollView>
  );
}
