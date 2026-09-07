import { AppText, Icon } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// The "Archived ›" row (spec §12–14). A navigation destination, not a
// filter tab — deliberately quiet so it doesn't compete with the
// conversation list below it.
export function ArchivedEntryRow({
  count,
  onPress,
}: {
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        count && count > 0
          ? `Archived, ${count} conversations`
          : "Archived conversations"
      }
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border/60 px-4 py-3 active:bg-muted"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-muted">
        <Icon name="archive-outline" size={18} tone="muted" />
      </View>
      <AppText variant="body" className="flex-1">
        Archived
      </AppText>
      {count && count > 0 ? (
        <AppText variant="meta">{count > 99 ? "99+" : count}</AppText>
      ) : null}
      <Icon name="chevron-forward" size={16} tone="muted" />
    </Pressable>
  );
}
