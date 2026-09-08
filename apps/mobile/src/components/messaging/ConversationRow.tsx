import { hapticMedium } from "@/lib/haptics";
import type { ConversationListItem } from "@abonten/api-client";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import type { ConversationType } from "@abonten/types/messagingType";
import { AppText, Avatar, Icon, type IoniconName } from "@abonten/ui-native";
import { type ReactElement, memo, useCallback, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import type { Rect } from "./contextMenu/menuPlacement";
import { useAnchorMeasure } from "./contextMenu/useAnchorMeasure";

// A tight unread count pill — a real 18px circle (a short pill past one
// digit), number centred. Raw Text + fixed geometry so AppText's default
// line-height ratio can't stretch it into a tall oval.
function UnreadPill({ count }: { count: number }) {
  const label = count > 99 ? "99+" : String(count);
  return (
    <View
      className="bg-primary"
      style={{
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        paddingHorizontal: label.length > 1 ? 6 : 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          color: "#ffffff",
          fontSize: 12,
          lineHeight: 20,
          fontWeight: "700",
          textAlign: "center",
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const TYPE_ICON: Record<ConversationType, IoniconName> = {
  event: "calendar-outline",
  place: "storefront-outline",
  support: "help-buoy-outline",
  direct: "chatbubble-ellipses-outline",
};

const CONTEXT_ICON: Record<ConversationType, IoniconName> = {
  event: "calendar-outline",
  place: "location-outline",
  support: "help-buoy-outline",
  direct: "chatbubble-ellipses-outline",
};

function identityFor(item: ConversationListItem): string {
  return (
    item.other_display_name ||
    item.subject_title ||
    item.title ||
    "Conversation"
  );
}

function previewFor(item: ConversationListItem, mine: boolean): string {
  if (!item.last_message_preview) return "No messages yet";
  return mine ? `You: ${item.last_message_preview}` : item.last_message_preview;
}

function SwipeAction({
  icon,
  label,
  tone,
  align,
}: {
  icon: IoniconName;
  label: string;
  tone: "brand" | "muted";
  align: "left" | "right";
}) {
  return (
    <View
      className={`w-24 items-center justify-center gap-1 ${
        tone === "brand" ? "bg-primary" : "bg-muted"
      } ${align === "left" ? "items-end pr-5" : "items-start pl-5"}`}
    >
      <Icon
        name={icon}
        size={20}
        tone={tone === "brand" ? "inverse" : "foreground"}
      />
      <AppText
        allowFontScaling={false}
        className={`text-[11px] font-semibold ${
          tone === "brand" ? "text-primary-foreground" : "text-foreground"
        }`}
      >
        {label}
      </AppText>
    </View>
  );
}

export const ConversationRow = memo(function ConversationRow({
  item,
  currentUserId,
  onPress,
  onLongPress,
  onArchiveToggle,
  onToggleRead,
  archivedView = false,
  hidden = false,
}: {
  item: ConversationListItem;
  currentUserId: string | undefined;
  // These take the row's item so the parent can hand down *stable*
  // callbacks. Previously the inbox built four fresh closures per row on
  // every render, which gave this component new prop references every time
  // and made the `memo` above a no-op — every row re-rendered whenever any
  // list state changed. Binding the item here keeps that memo effective.
  onPress: (item: ConversationListItem) => void;
  onLongPress?: (item: ConversationListItem, rect: Rect) => void;
  onArchiveToggle?: (item: ConversationListItem) => void;
  onToggleRead?: (item: ConversationListItem) => void;
  archivedView?: boolean;
  /** Its lifted peek is showing in the overlay — hide the real row so it
   *  isn't visible behind the lift-out. */
  hidden?: boolean;
}) {
  const { ref: rowRef, measure } = useAnchorMeasure();
  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  const handleLongPress = useCallback(() => {
    if (!onLongPress) return;
    hapticMedium();
    measure().then((rect) => {
      if (rect) onLongPress(item, rect);
    });
  }, [onLongPress, item, measure]);
  const handleArchiveToggle = useCallback(
    () => onArchiveToggle?.(item),
    [onArchiveToggle, item],
  );
  const handleToggleRead = useCallback(
    () => onToggleRead?.(item),
    [onToggleRead, item],
  );
  const unread = item.unread_count > 0;
  const lastFromMe =
    !!currentUserId && item.last_message_sender_id === currentUserId;
  const identity = identityFor(item);
  const context =
    (item.type === "event" || item.type === "place") &&
    item.subject_title &&
    item.subject_title !== identity
      ? item.subject_title
      : null;
  const showAvatar = item.type !== "support" && !!item.other_user_id;

  const row = (
    <Pressable
      ref={rowRef}
      accessibilityRole="button"
      accessibilityLabel={`${identity}${unread ? `, ${item.unread_count} unread` : ""}. Long press for actions`}
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={280}
      style={hidden ? { opacity: 0 } : undefined}
      className="relative flex-row items-center gap-3.5 bg-background px-4 py-3.5 active:bg-muted"
    >
      {/* Divider inset to the text start — the WhatsApp / iMessage list look. */}
      <View className="absolute bottom-0 left-[82px] right-0 h-px bg-border/60" />

      {showAvatar ? (
        <Avatar
          publicId={item.other_avatar_public_id}
          version={item.other_avatar_version}
          size={52}
        />
      ) : (
        <View className="h-[52px] w-[52px] items-center justify-center rounded-full bg-accent">
          <Icon name={TYPE_ICON[item.type]} size={24} tone="primary" />
        </View>
      )}

      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <AppText
            variant={unread ? "bodyStrong" : "body"}
            numberOfLines={1}
            className="flex-1 text-[16.5px] leading-[21px]"
          >
            {identity}
          </AppText>
          {item.last_message_at ? (
            <AppText
              variant="caption"
              tone={unread ? "brand" : "muted"}
              className={`text-[13px] ${unread ? "font-semibold" : ""}`}
            >
              {getRelativeTime(item.last_message_at)}
            </AppText>
          ) : null}
        </View>

        {context ? (
          <View className="flex-row items-center gap-1">
            <Icon name={CONTEXT_ICON[item.type]} size={12} tone="muted" />
            <AppText variant="meta" numberOfLines={1} className="flex-1">
              {context}
            </AppText>
          </View>
        ) : null}

        <View className="flex-row items-center gap-2">
          <AppText
            variant={unread ? "bodyStrong" : "meta"}
            numberOfLines={1}
            className="flex-1 text-[14px] leading-[19px]"
          >
            {previewFor(item, lastFromMe)}
          </AppText>
          {item.muted ? (
            <Icon name="notifications-off-outline" size={13} tone="muted" />
          ) : null}
          {unread ? <UnreadPill count={item.unread_count} /> : null}
        </View>
      </View>
    </Pressable>
  );

  if (!onArchiveToggle && !onToggleRead) return row;

  return (
    <SwipeableRow
      row={row}
      unread={unread}
      archivedView={archivedView}
      onArchiveToggle={onArchiveToggle ? handleArchiveToggle : undefined}
      onToggleRead={onToggleRead ? handleToggleRead : undefined}
    />
  );
});

function SwipeableRow({
  row,
  unread,
  archivedView,
  onArchiveToggle,
  onToggleRead,
}: {
  row: ReactElement;
  unread: boolean;
  archivedView: boolean;
  onArchiveToggle?: () => void;
  onToggleRead?: () => void;
}) {
  const ref = useRef<Swipeable>(null);
  return (
    <Swipeable
      ref={ref}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={
        onToggleRead
          ? () => (
              <SwipeAction
                align="left"
                tone="muted"
                icon={unread ? "checkmark-done-outline" : "ellipse-outline"}
                label={unread ? "Read" : "Unread"}
              />
            )
          : undefined
      }
      renderRightActions={
        onArchiveToggle
          ? () => (
              <SwipeAction
                align="right"
                tone="brand"
                icon={archivedView ? "arrow-undo-outline" : "archive-outline"}
                label={archivedView ? "Unarchive" : "Archive"}
              />
            )
          : undefined
      }
      onSwipeableOpen={(dir) => {
        ref.current?.close();
        if (dir === "right") onArchiveToggle?.();
        else onToggleRead?.();
      }}
    >
      {row}
    </Swipeable>
  );
}
