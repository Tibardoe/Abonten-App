import { clockTime } from "@/features/messaging/messagingTime";
import {
  flattenMessages,
  useConversationMessages,
} from "@/features/messaging/useConversation";
import type { MessageRow } from "@abonten/api-client";
import { AppText, Icon, Spinner } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useMemo } from "react";
import { View } from "react-native";

// The miniature conversation shown inside the inbox peek. WhatsApp and
// iMessage both preview the CHAT, not just its last line -- you should be
// able to see how the exchange was going before deciding to open it. So this
// renders the tail of the real thread as real bubbles, at a reduced scale.
//
// Deliberately dumb and bounded:
//   * it renders at most TAIL messages, oldest-first, so the newest sits at
//     the bottom exactly as it does in the thread;
//   * no gestures, no long-press, no attachments pipeline -- media and voice
//     collapse to a labelled chip, because a peek that started signing URLs
//     and decoding images would cost more than the chat it is previewing;
//   * it reuses useConversationMessages, so a thread the user already opened
//     paints instantly from the query cache and only a background refetch
//     runs. A never-opened thread shows a spinner for one fetch.

const TAIL = 6;

function previewLine(m: MessageRow): string | null {
  if (m.deleted_at) return "This message was deleted";
  if (m.content) return m.content;
  switch (m.message_type) {
    case "image":
      return "Photo";
    case "audio":
      return "Voice message";
    case "file":
      return "Attachment";
    default:
      return null;
  }
}

function glyphFor(m: MessageRow) {
  if (m.deleted_at || m.content) return null;
  if (m.message_type === "image") return "image" as const;
  if (m.message_type === "audio") return "mic" as const;
  if (m.message_type === "file") return "document" as const;
  return null;
}

export function PeekThread({
  conversationId,
  currentUserId,
}: {
  conversationId: string;
  currentUserId: string | undefined;
}) {
  const c = useThemeColors();
  const q = useConversationMessages(conversationId);
  const rows = flattenMessages(q.data?.pages);

  // flattenMessages is newest-first (the thread renders inverted); the peek
  // is a normal top-to-bottom strip, so take the newest TAIL and flip them.
  const tail = useMemo(
    () =>
      rows
        .filter((m) => m.message_type !== "system")
        .slice(0, TAIL)
        .reverse(),
    [rows],
  );

  if (tail.length === 0) {
    return (
      <View className="items-center justify-center py-6">
        {q.isLoading ? (
          <Spinner />
        ) : (
          <AppText variant="meta" tone="muted">
            No messages yet
          </AppText>
        )}
      </View>
    );
  }

  return (
    <View className="gap-1.5 py-1">
      {tail.map((m) => {
        const isMine = !!currentUserId && m.sender_id === currentUserId;
        const line = previewLine(m);
        const glyph = glyphFor(m);
        return (
          <View
            key={m.id}
            className={isMine ? "items-end" : "items-start"}
            style={{ width: "100%" }}
          >
            <View
              className={`max-w-[82%] rounded-[14px] px-2.5 py-1.5 ${
                isMine
                  ? "rounded-br-[4px] bg-primary"
                  : "rounded-bl-[4px] bg-secondary"
              }`}
            >
              <View className="flex-row items-center gap-1.5">
                {glyph ? (
                  <Icon
                    name={glyph}
                    size={12}
                    tone={isMine ? "inverse" : "muted"}
                  />
                ) : null}
                <AppText
                  numberOfLines={2}
                  className={`text-[13.5px] leading-[18px] ${
                    m.deleted_at ? "italic " : ""
                  }${isMine ? "text-primary-foreground" : ""}`}
                >
                  {line}
                </AppText>
              </View>
            </View>
            <AppText
              variant="caption"
              tone="muted"
              className="mt-0.5 px-1 text-[11px]"
              style={{ color: c["muted-foreground"] }}
            >
              {clockTime(m.created_at)}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}
