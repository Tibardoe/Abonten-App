import {
  CUSTOM_FILTER_LABEL,
  type CustomFilterKey,
} from "@/features/messaging/inboxPrefs";
import type { ConversationRoleScope } from "@abonten/api-client";
import { AppText, Chip, Icon } from "@abonten/ui-native";
import { Pressable, ScrollView, View } from "react-native";

const ROLE_CHIPS: { key: ConversationRoleScope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "member", label: "As Customer" },
  { key: "business", label: "As Organizer" },
];

// The horizontal chip row beneath the search bar (spec §4). One of the
// three role chips is always active (the "smart inbox mode"); each custom
// chip present in the row is an on filter — tapping it removes it. The `+`
// opens the add-filter sheet. Never wraps: the row scrolls.
export function InboxFilterChips({
  roleScope,
  onRoleScopeChange,
  customFilters,
  onRemoveCustomFilter,
  onAddPress,
}: {
  roleScope: ConversationRoleScope;
  onRoleScopeChange: (scope: ConversationRoleScope) => void;
  customFilters: CustomFilterKey[];
  onRemoveCustomFilter: (key: CustomFilterKey) => void;
  onAddPress: () => void;
}) {
  return (
    // The horizontal ScrollView must not flex-grow: dropped straight into a
    // flex column it otherwise balloons to fill the free vertical space and
    // the chips float in the middle with big gaps above/below (same trap as
    // CategoryChipsRow). flexGrow:0 pins it to its content height.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingVertical: 6,
        gap: 8,
        alignItems: "center",
      }}
    >
      {ROLE_CHIPS.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          selected={roleScope === chip.key}
          showCheck
          onPress={() => onRoleScopeChange(chip.key)}
        />
      ))}

      {customFilters.length > 0 ? (
        <View className="h-5 w-px bg-border" />
      ) : null}

      {customFilters.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={`${CUSTOM_FILTER_LABEL[key]} filter, active`}
          accessibilityHint="Removes this filter"
          onPress={() => onRemoveCustomFilter(key)}
          className="flex-row items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 active:opacity-80"
        >
          <AppText className="text-[13px] font-semibold text-primary-foreground">
            {CUSTOM_FILTER_LABEL[key]}
          </AppText>
          <Icon name="close" size={13} tone="inverse" />
        </Pressable>
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add filter"
        onPress={onAddPress}
        className="h-9 w-9 items-center justify-center rounded-full border border-border bg-muted active:opacity-80"
      >
        <Icon name="add" size={18} tone="foreground" />
      </Pressable>
    </ScrollView>
  );
}
