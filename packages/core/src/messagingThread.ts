// Pure thread-assembly + time helpers shared by the mobile and web chat
// screens (no react-native / next imports). Given a page of server messages
// (newest-first) plus the client's optimistic outbox, it produces the flat
// list of render entries — day separators, sender-grouping flags — that both
// platforms draw. Output stays newest-first so an inverted list (native
// FlatList `inverted`, web `flex-col-reverse`) renders index 0 at the bottom.

import type {
  MessageReplyPreview,
  MessageRow,
} from "@abonten/types/messagingType";
import { coreString, intlLocale } from "./i18n/coreStrings";

// The minimum an optimistic (not-yet-confirmed) message must expose for the
// thread builder. Each platform's outbox type structurally satisfies this.
export type PendingMessageLike = {
  clientGeneratedId: string;
  content: string | null;
  replyToMessageId: string | null;
  createdAt: string;
  hasAttachments: boolean;
  /** Set for a non-text optimistic send (a photo, a voice note) so the
   *  bubble renders the right shape before the server confirms it. */
  messageType?: MessageRow["message_type"];
};

export type ChatEntry<P extends PendingMessageLike = PendingMessageLike> =
  | { kind: "day"; id: string; label: string }
  | {
      kind: "msg";
      id: string;
      message: MessageRow;
      pending?: P;
      isMine: boolean;
      isGroupStart: boolean;
    };

// Messages from the same sender within this gap render as one visual cluster
// (no repeated avatar / name, tighter spacing).
export const GROUPING_WINDOW_MS = 3 * 60_000;

export function clockTime(iso: string, locale?: string | null): string {
  return new Date(iso).toLocaleTimeString(intlLocale(locale), {
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isSameCalendarDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

// "Today" / "Yesterday" / "Mon, 5 Sep" / "5 Sep 2024" — the label above the
// first message of each calendar day.
export function daySeparatorLabel(iso: string, locale?: string | null): string {
  const then = new Date(iso);
  const today = startOfDay(new Date());
  const thatDay = startOfDay(then);
  const dayMs = 86_400_000;

  if (thatDay === today) return coreString("today", locale);
  if (thatDay === today - dayMs) return coreString("yesterday", locale);

  const sameYear = then.getFullYear() === new Date().getFullYear();
  return then.toLocaleDateString(intlLocale(locale), {
    weekday: sameYear ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}

/**
 * The "replying to" quote for a message already in the thread — the same
 * trimmed shape the server attaches to a page of messages (a deleted
 * message quotes no text; a photo, file or voice note quotes its first
 * attachment).
 */
export function replyPreviewOf(message: MessageRow): MessageReplyPreview {
  const first = message.deleted_at ? undefined : message.attachments[0];
  return {
    id: message.id,
    sender_id: message.sender_id,
    message_type: message.message_type,
    content: message.deleted_at ? null : message.content,
    deleted_at: message.deleted_at,
    ...(first
      ? {
          attachment_path: first.storage_path,
          attachment_mime: first.mime_type,
          duration_seconds: first.duration_seconds,
        }
      : {}),
  };
}

function pendingToRow(
  p: PendingMessageLike,
  myId: string,
  replyTo: MessageReplyPreview | null,
): MessageRow {
  return {
    id: p.clientGeneratedId,
    conversation_id: "",
    sender_id: myId,
    message_type: p.messageType ?? (p.hasAttachments ? "image" : "text"),
    content: p.content,
    system_event: null,
    system_data: {},
    reply_to_message_id: p.replyToMessageId,
    client_generated_id: p.clientGeneratedId,
    moderation_state: "visible",
    created_at: p.createdAt,
    edited_at: null,
    deleted_at: null,
    attachments: [],
    reply_to: replyTo,
  };
}

export function buildChatEntries<P extends PendingMessageLike>(
  serverNewestFirst: MessageRow[],
  pending: P[],
  myId: string | undefined,
): ChatEntry<P>[] {
  if (!myId) return [];

  // Confirmed clientGeneratedIds — drop the matching optimistic rows.
  const confirmed = new Set(
    serverNewestFirst
      .map((m) => m.client_generated_id)
      .filter((v): v is string => !!v),
  );
  const stillPending = pending.filter(
    (p) => !confirmed.has(p.clientGeneratedId),
  );

  // A reply shows its quote at once: while it is still sending, and when the
  // copy that just arrived (the send's answer, a realtime insert) carries
  // only the id of the message it answers. The quoted message is almost
  // always on screen — it is what the person swiped to reply to.
  const byId = new Map(serverNewestFirst.map((m) => [m.id, m]));
  const quoteFor = (replyToId: string | null): MessageReplyPreview | null => {
    const target = replyToId ? byId.get(replyToId) : undefined;
    return target ? replyPreviewOf(target) : null;
  };
  const withQuote = (message: MessageRow): MessageRow =>
    message.reply_to_message_id && !message.reply_to
      ? { ...message, reply_to: quoteFor(message.reply_to_message_id) }
      : message;

  // Oldest -> newest working order so day separators + grouping are a simple
  // forward scan; reverse at the end.
  const oldestFirst: { message: MessageRow; pending?: P }[] = [
    ...[...serverNewestFirst]
      .reverse()
      .map((message) => ({ message: withQuote(message) })),
    ...stillPending.map((p) => ({
      message: pendingToRow(p, myId, quoteFor(p.replyToMessageId)),
      pending: p,
    })),
  ];

  const out: ChatEntry<P>[] = [];
  let prev: MessageRow | null = null;

  for (const { message, pending: pendingRow } of oldestFirst) {
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
      pending: pendingRow,
      isMine: message.sender_id === myId,
      isGroupStart: isSystem || !sameSender || !withinWindow,
    });

    prev = message;
  }

  return out.reverse();
}
