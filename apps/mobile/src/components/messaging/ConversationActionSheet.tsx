import type { ConversationListItem } from "@abonten/api-client";
import { Icon, type IoniconName, Sheet } from "@abonten/ui-native";
import { AppText } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// Long-press menu for an inbox row — the accessible equivalent of the swipe
// gestures (spec §24–25). Only actions the backend actually supports:
// per-participant mute, archive, and read state.
export function ConversationActionSheet({
  item,
  onClose,
  onToggleRead,
  onToggleMute,
  onToggleArchive,
}: {
  item: ConversationListItem | null;
  onClose: () => void;
  onToggleRead: (item: ConversationListItem) => void;
  onToggleMute: (item: ConversationListItem) => void;
  onToggleArchive: (item: ConversationListItem) => void;
}) {
  const unread = (item?.unread_count ?? 0) > 0;

  const rows: {
    icon: IoniconName;
    label: string;
    run: () => void;
  }[] = item
    ? [
        {
          icon: unread ? "checkmark-done-outline" : "ellipse-outline",
          label: unread ? "Mark as read" : "Mark as unread",
          run: () => onToggleRead(item),
        },
        {
          icon: item.muted
            ? "notifications-outline"
            : "notifications-off-outline",
          label: item.muted ? "Unmute" : "Mute",
          run: () => onToggleMute(item),
        },
        {
          icon: item.archived ? "arrow-undo-outline" : "archive-outline",
          label: item.archived ? "Unarchive" : "Archive",
          run: () => onToggleArchive(item),
        },
      ]
    : [];

  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={item ? (item.title ?? "Conversation") : undefined}
    >
      <View className="gap-1">
        {rows.map((r) => (
          <Pressable
            key={r.label}
            accessibilityRole="button"
            accessibilityLabel={r.label}
            onPress={() => {
              r.run();
              onClose();
            }}
            className="min-h-[52px] flex-row items-center gap-3 rounded-xl px-2 active:bg-muted"
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-accent">
              <Icon name={r.icon} size={18} tone="primary" />
            </View>
            <AppText variant="body">{r.label}</AppText>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
