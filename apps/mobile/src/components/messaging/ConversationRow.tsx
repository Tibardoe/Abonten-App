import type { ConversationListItem } from "@abonten/api-client";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import type { ConversationType } from "@abonten/types/messagingType";
import { AppText, Icon, type IoniconName } from "@abonten/ui-native";
import { memo } from "react";
import { Pressable, View } from "react-native";

const TYPE_ICON: Record<ConversationType, IoniconName> = {
  event: "calendar-outline",
  place: "storefront-outline",
  support: "help-buoy-outline",
  direct: "chatbubble-ellipses-outline",
};

function subtitleFor(item: ConversationListItem, mine: boolean): string {
  if (!item.last_message_preview) return "No messages yet";
  return mine ? `You: ${item.last_message_preview}` : item.last_message_preview;
}

export const ConversationRow = memo(function ConversationRow({
  item,
  currentUserId,
  onPress,
}: {
  item: ConversationListItem;
  currentUserId: string | undefined;
  onPress: () => void;
}) {
  const unread = item.unread_count > 0;
  const lastFromMe =
    !!currentUserId && item.last_message_sender_id === currentUserId;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 active:opacity-80"
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon name={TYPE_ICON[item.type]} size={22} tone="muted" />
      </View>

      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <AppText
            variant={unread ? "bodyStrong" : "body"}
            numberOfLines={1}
            className="flex-1"
          >
            {item.title ?? "Conversation"}
          </AppText>
          {item.last_message_at ? (
            <AppText variant="caption" tone={unread ? "brand" : "muted"}>
              {getRelativeTime(item.last_message_at)}
            </AppText>
          ) : null}
        </View>

        <View className="flex-row items-center gap-2">
          <AppText
            variant={unread ? "bodyStrong" : "meta"}
            numberOfLines={1}
            className="flex-1"
          >
            {subtitleFor(item, lastFromMe)}
          </AppText>
          {item.muted ? (
            <Icon name="notifications-off-outline" size={13} tone="muted" />
          ) : null}
          {unread ? (
            <View className="min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5">
              <AppText
                allowFontScaling={false}
                className="text-[11px] font-bold text-primary-foreground"
              >
                {item.unread_count > 99 ? "99+" : item.unread_count}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});
