import { Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Pressable, TextInput, View } from "react-native";

// The inbox search field — sits above the filter chips (spec §3). Controlled
// by the screen; the screen debounces before it reaches the query. Keyboard
// stays on a single line, submits as "search", and clears with the trailing
// button.
export function InboxSearchBar({
  value,
  onChangeText,
  onClear,
  placeholder = "Search messages",
}: {
  value: string;
  onChangeText: (v: string) => void;
  onClear: () => void;
  placeholder?: string;
}) {
  const c = useThemeColors();
  return (
    <View className="mx-4 mb-1 mt-2 flex-row items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2.5">
      <Icon name="search-outline" size={18} tone="muted" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c["muted-foreground"]}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        className="flex-1 p-0 text-[15px] text-foreground"
        style={{ color: c.foreground }}
        accessibilityLabel="Search messages"
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={onClear}
          hitSlop={8}
        >
          <Icon name="close-circle" size={18} tone="muted" />
        </Pressable>
      ) : null}
    </View>
  );
}
