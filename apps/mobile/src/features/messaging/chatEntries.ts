import type { MessageRow } from "@abonten/api-client";
import { daySeparatorLabel, isSameCalendarDay } from "./messagingTime";
import type { OutboxMessage } from "./useMessageOutbox";

// A rendered row in the chat thread. `msg` rows carry an `isGroupStart` flag
// (first of a same-sender cluster) so the bubble can decide whether to show
// the avatar / sender name and how much top margin to use.
export type ChatEntry =
  | { kind: "day"; id: string; label: string }
  | {
      kind: "msg";
      id: string;
      message: MessageRow;
      pending?: OutboxMessage;
      isMine: boolean;
      isGroupStart: boolean;
    };

const GROUPING_WINDOW_MS = 3 * 60_000;

// Turn an outbox row into a MessageRow-shaped object so one bubble component
// renders both. `id` is the clientGeneratedId, sender is me, timestamps are
// the optimistic local time.
function outboxToRow(o: OutboxMessage, myId: string): MessageRow {
  return {
    id: o.clientGeneratedId,
    conversation_id: "",
    sender_id: myId,
    message_type: o.attachments.length > 0 ? "image" : "text",
    content: o.content,
    system_event: null,
    system_data: {},
    reply_to_message_id: o.replyToMessageId,
    client_generated_id: o.clientGeneratedId,
    moderation_state: "visible",
    created_at: o.createdAt,
    edited_at: null,
    deleted_at: null,
    attachments: [],
    reply_to: null,
  };
}

// Server rows come newest-first (page 0 = newest). Outbox rows are the
// not-yet-confirmed sends. Output is newest-first (index 0 renders at the
// bottom of an inverted FlatList), with a "day" entry directly below the
// oldest message of each calendar day.
export function buildChatEntries(
  serverNewestFirst: MessageRow[],
  outbox: OutboxMessage[],
  myId: string | undefined,
): ChatEntry[] {
  if (!myId) return [];

  // Confirmed clientGeneratedIds — drop the matching optimistic rows.
  const confirmedClientIds = new Set(
    serverNewestFirst
      .map((m) => m.client_generated_id)
      .filter((v): v is string => !!v),
  );
  const pendingRows = outbox.filter(
    (o) => !confirmedClientIds.has(o.clientGeneratedId),
  );

  // Oldest -> newest working order so day separators and grouping are a
  // simple forward scan; reverse at the end for the inverted list.
  const oldestFirst: { message: MessageRow; pending?: OutboxMessage }[] = [
    ...[...serverNewestFirst].reverse().map((message) => ({ message })),
    ...pendingRows.map((p) => ({
      message: outboxToRow(p, myId),
      pending: p,
    })),
  ];

  const out: ChatEntry[] = [];
  let prev: MessageRow | null = null;

  for (const { message, pending } of oldestFirst) {
    if (!prev || !isSameCalendarDay(prev.created_at, message.created_at)) {
      out.push({
        kind: "day",
        id: `day-${message.created_at.slice(0, 10)}`,
        label: daySeparatorLabel(message.created_at),
      });
    }

    const isSystem = message.message_type === "system";
    const sameSender =
      !!prev &&
      prev.message_type !== "system" &&
      prev.sender_id === message.sender_id;
    const withinWindow =
      !!prev &&
      new Date(message.created_at).getTime() -
        new Date(prev.created_at).getTime() <
        GROUPING_WINDOW_MS;

    out.push({
      kind: "msg",
      id: message.id,
      message,
      pending,
      isMine: message.sender_id === myId,
      isGroupStart: isSystem || !sameSender || !withinWindow,
    });

    prev = message;
  }

  return out.reverse();
}
