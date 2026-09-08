import { useRecentReactions } from "@/features/messaging/recentReactions";
import type { MessageRow } from "@abonten/api-client";
import { useState } from "react";
import { useWindowDimensions } from "react-native";
import {
  type ContextAction,
  ContextualActionOverlay,
} from "./contextMenu/ContextualActionOverlay";
import { EmojiPickerSheet } from "./contextMenu/EmojiPickerSheet";
import { MessagePreviewCard } from "./contextMenu/MessagePreviewCard";
import { ReactionBar } from "./contextMenu/ReactionBar";
import type { Rect } from "./contextMenu/menuPlacement";

export type MessageMenuTarget = { message: MessageRow; rect: Rect };

// The message-specific wiring of the shared contextual overlay (spec §1,
// §5–7). Only the actions the backend actually permits are shown — Copy is
// text-only, Edit / Delete are the caller's own messages only (both
// re-checked in the edit_message / delete_message RPCs regardless).
export function MessageActionOverlay({
  target,
  isMine,
  seen,
  canCopy,
  canEdit,
  canDelete,
  onDismiss,
  onReply,
  onEdit,
  onDelete,
  onCopy,
  onReact,
  currentUserId,
}: {
  target: MessageMenuTarget | null;
  isMine: boolean;
  /** The bubble's read state, so the lifted clone draws the same tick. */
  seen: boolean;
  canCopy: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onDismiss: () => void;
  onReply: (m: MessageRow) => void;
  onEdit: (m: MessageRow) => void;
  onDelete: (m: MessageRow) => void;
  onCopy: (text: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  /** Scopes the remembered custom emoji to this account. */
  currentUserId: string | undefined;
}) {
  const screen = useWindowDimensions();
  const message = target?.message ?? null;
  const { recents, emojis, remember } = useRecentReactions(currentUserId);
  // Held between the overlay closing and the picker opening, because the
  // overlay must dismiss first (its scrim would otherwise sit over the
  // keyboard) and the message id would be gone by then.
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  function react(messageId: string, emoji: string) {
    remember(emoji);
    onReact(messageId, emoji);
  }

  const actions: ContextAction[] = [];
  if (message) {
    actions.push({
      key: "reply",
      label: "Reply",
      icon: "arrow-undo-outline",
      onPress: () => onReply(message),
    });
    if (canCopy && message.message_type === "text" && message.content) {
      actions.push({
        key: "copy",
        label: "Copy",
        icon: "copy-outline",
        onPress: () => onCopy(message.content ?? ""),
      });
    }
    if (canEdit) {
      actions.push({
        key: "edit",
        label: "Edit",
        icon: "create-outline",
        onPress: () => onEdit(message),
      });
    }
    if (canDelete) {
      actions.push({
        key: "delete",
        label: "Delete",
        icon: "trash-outline",
        destructive: true,
        onPress: () => onDelete(message),
      });
    }
  }

  const mineEmoji =
    message?.reactions?.find((r) => r.reacted_by_me)?.emoji ?? null;

  return (
    <>
      <ContextualActionOverlay
        visible={!!target}
        anchor={target?.rect ?? null}
        onDismiss={onDismiss}
        actions={actions}
        align={isMine ? "end" : "start"}
        // Safety clamp only — real bubbles are max-80% so the lifted clone keeps
        // the bubble's exact width and horizontal position (spec §8).
        maxPreviewWidth={screen.width * 0.94}
        a11yPreviewLabel="Selected message"
        renderAccessory={
          message
            ? (dismiss) => (
                <ReactionBar
                  mine={mineEmoji}
                  emojis={emojis}
                  // Pick → close the overlay, then persist, so the pill lands
                  // on the real bubble the instant the menu clears (spec §21).
                  onPick={(emoji) => dismiss(() => react(message.id, emoji))}
                  // Same ordering for "+": let the lift-out animate away before
                  // the keyboard comes up, so the two don't fight for the screen.
                  onMore={() => dismiss(() => setPickerFor(message.id))}
                />
              )
            : undefined
        }
        accessoryHeight={50}
        renderPreview={() =>
          message ? (
            <MessagePreviewCard message={message} isMine={isMine} seen={seen} />
          ) : null
        }
      />

      <EmojiPickerSheet
        open={!!pickerFor}
        recents={recents}
        onPick={(emoji) => {
          if (pickerFor) react(pickerFor, emoji);
        }}
        onClose={() => setPickerFor(null)}
      />
    </>
  );
}
