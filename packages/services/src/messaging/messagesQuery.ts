import { logger } from "@abonten/core/logger";
import {
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type { Database } from "@abonten/types/database.types";
import type {
  MessageAttachmentRow,
  MessageReactionSummary,
  MessageReplyPreview,
  MessageRow,
} from "@abonten/types/messagingType";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";

// Newest-first, keyset-paginated page of one conversation's messages, shared
// by the web getConversationMessages action and the
// GET /api/mobile/messages/:id/messages route. Runs on the caller's own
// session client — RLS (`message_participant_select`) already restricts this
// to conversations the caller belongs to, so a non-participant simply gets
// an empty page. Soft-deleted messages are kept in the result (so the UI can
// render a "message deleted" placeholder) but stripped of their content and
// attachments here — the row stays for moderation, the payload doesn't leak.

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 60;

type RawMessage = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  message_type: MessageRow["message_type"];
  content: string | null;
  system_event: string | null;
  system_data: Record<string, unknown> | null;
  reply_to_message_id: string | null;
  client_generated_id: string | null;
  moderation_state: MessageRow["moderation_state"];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

function redactDeleted<T extends { deleted_at: string | null }>(
  row: T & { content: string | null },
): T & { content: string | null } {
  if (row.deleted_at) return { ...row, content: null };
  return row;
}

export async function fetchMessagesPage(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  options?: {
    cursor?: string | null;
    pageSize?: number;
    /** The authenticated caller, used to flag which reactions are theirs.
     *  Both transports have already resolved it, so passing it here avoids a
     *  redundant auth-server round trip on this hot read path. Omitted only
     *  by tests, which fall back to an `auth.getUser()` lookup. */
    callerId?: string | null;
  },
): Promise<PaginatedResult<MessageRow>> {
  const pageSize = Math.min(
    Math.max(options?.pageSize ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  let query = supabase
    .from("message")
    .select(
      "id, conversation_id, sender_id, message_type, content, system_event, system_data, reply_to_message_id, client_generated_id, moderation_state, created_at, edited_at, deleted_at",
    )
    .eq("conversation_id", conversationId)
    // Only 'visible' rows reach a participant. A moderator's hide / remove /
    // restrict (Phase 8) takes the message out of the thread for everyone
    // except staff, who reach it through the report, not this query.
    .eq("moderation_state", "visible")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data, error } = await query;

  if (error) {
    logger.error(`fetchMessagesPage failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  const rows = (data ?? []) as RawMessage[];

  // RLS hides every row of a conversation the caller isn't in, which is
  // indistinguishable from a thread that is simply empty. The detail
  // endpoint answers 404 for a non-participant; this one used to answer
  // 200 + [] and the client rendered an empty thread. Only an empty first
  // page can be ambiguous, so the membership check runs only then — the
  // common path costs nothing extra.
  if (rows.length === 0 && !cursor) {
    const callerForCheck =
      options?.callerId ??
      (await supabase.auth.getUser()).data.user?.id ??
      null;
    const { data: isParticipant } = callerForCheck
      ? await supabase.rpc("is_conversation_participant", {
          p_conversation_id: conversationId,
          p_user_id: callerForCheck,
        })
      : { data: false };
    if (!isParticipant) {
      return {
        status: 404,
        data: [],
        nextCursor: null,
        hasNextPage: false,
        message: "Conversation not found.",
      };
    }
  }

  const { page, hasNextPage } = splitPage(rows, pageSize);

  const messageIds = page.map((m) => m.id);
  const replyIds = [
    ...new Set(
      page
        .map((m) => m.reply_to_message_id)
        .filter((id): id is string => id != null),
    ),
  ];

  // The caller's own id — needed to mark which reactions are "mine" so the
  // pill row can highlight them and toggle them off. RLS already scopes this
  // query to a participant, so a failed lookup just means no "mine" flag.
  // `auth.getUser()` hits the auth server, so it runs only when the caller
  // didn't already supply the id (tests); both transports do supply it.
  const callerId =
    options?.callerId ?? (await supabase.auth.getUser()).data.user?.id ?? null;

  const [attachmentsByMessage, replyPreviews, reactionsByMessage] =
    await Promise.all([
      loadAttachments(supabase, messageIds),
      loadReplyPreviews(supabase, replyIds),
      loadReactions(supabase, messageIds, callerId),
    ]);

  const shaped: MessageRow[] = page.map((m) => {
    const redacted = redactDeleted(m);
    return {
      id: redacted.id,
      conversation_id: redacted.conversation_id,
      sender_id: redacted.sender_id,
      message_type: redacted.message_type,
      content: redacted.content,
      system_event: redacted.system_event,
      system_data: redacted.system_data ?? {},
      reply_to_message_id: redacted.reply_to_message_id,
      client_generated_id: redacted.client_generated_id,
      moderation_state: redacted.moderation_state,
      created_at: redacted.created_at,
      edited_at: redacted.edited_at,
      deleted_at: redacted.deleted_at,
      attachments: redacted.deleted_at
        ? []
        : (attachmentsByMessage.get(redacted.id) ?? []),
      reply_to: redacted.reply_to_message_id
        ? (replyPreviews.get(redacted.reply_to_message_id) ?? null)
        : null,
      reactions: redacted.deleted_at
        ? []
        : (reactionsByMessage.get(redacted.id) ?? []),
    };
  });

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.id,
        })
      : null;

  return { status: 200, data: shaped, nextCursor, hasNextPage };
}

async function loadAttachments(
  supabase: SupabaseClient<Database>,
  messageIds: string[],
): Promise<Map<string, MessageAttachmentRow[]>> {
  const byMessage = new Map<string, MessageAttachmentRow[]>();
  if (messageIds.length === 0) return byMessage;

  const { data, error } = await supabase
    .from("message_attachment")
    .select("*")
    .in("message_id", messageIds);

  if (error) {
    logger.error(`fetchMessagesPage: attachment load failed: ${error.message}`);
    return byMessage;
  }

  for (const row of (data ?? []) as MessageAttachmentRow[]) {
    const list = byMessage.get(row.message_id) ?? [];
    list.push(row);
    byMessage.set(row.message_id, list);
  }
  return byMessage;
}

async function loadReplyPreviews(
  supabase: SupabaseClient<Database>,
  replyIds: string[],
): Promise<Map<string, MessageReplyPreview>> {
  const byId = new Map<string, MessageReplyPreview>();
  if (replyIds.length === 0) return byId;

  const { data, error } = await supabase
    .from("message")
    .select("id, sender_id, message_type, content, deleted_at")
    .in("id", replyIds);

  if (error) {
    logger.error(
      `fetchMessagesPage: reply preview load failed: ${error.message}`,
    );
    return byId;
  }

  const previews = (data ?? []) as MessageReplyPreview[];
  for (const row of previews) {
    byId.set(row.id, row.deleted_at ? { ...row, content: null } : row);
  }

  // Non-text reply targets: pull the first attachment's storage path + mime +
  // (for audio/video) duration so the quote can render a thumbnail and read
  // "Photo" / "🎬 Video" / "🎤 Voice message · 0:18" instead of a bare label.
  const mediaIds = previews
    .filter(
      (p) =>
        !p.deleted_at &&
        (p.message_type === "audio" ||
          p.message_type === "image" ||
          p.message_type === "file"),
    )
    .map((p) => p.id);
  if (mediaIds.length > 0) {
    const { data: atts } = await supabase
      .from("message_attachment")
      .select("message_id, storage_path, mime_type, duration_seconds")
      .in("message_id", mediaIds);
    // Keep only the first attachment per message.
    const seen = new Set<string>();
    for (const a of atts ?? []) {
      if (seen.has(a.message_id)) continue;
      seen.add(a.message_id);
      const existing = byId.get(a.message_id);
      if (existing) {
        byId.set(a.message_id, {
          ...existing,
          attachment_path: a.storage_path,
          attachment_mime: a.mime_type,
          duration_seconds: a.duration_seconds,
        });
      }
    }
  }

  return byId;
}

// Per-emoji reaction rollup for a page of messages, with the caller's own
// reactions flagged. One flat read (RLS-scoped to the participant) folded
// client-side — reaction volume per page is tiny.
async function loadReactions(
  supabase: SupabaseClient<Database>,
  messageIds: string[],
  callerId: string | null,
): Promise<Map<string, MessageReactionSummary[]>> {
  const byMessage = new Map<string, MessageReactionSummary[]>();
  if (messageIds.length === 0) return byMessage;

  const { data, error } = await supabase
    .from("message_reaction")
    .select("message_id, emoji, user_id")
    .in("message_id", messageIds);

  if (error) {
    logger.error(`fetchMessagesPage: reaction load failed: ${error.message}`);
    return byMessage;
  }

  // message_id -> emoji -> { count, mine }
  const scratch = new Map<
    string,
    Map<string, { count: number; mine: boolean }>
  >();
  for (const row of data ?? []) {
    const perEmoji = scratch.get(row.message_id) ?? new Map();
    const cur = perEmoji.get(row.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (callerId && row.user_id === callerId) cur.mine = true;
    perEmoji.set(row.emoji, cur);
    scratch.set(row.message_id, perEmoji);
  }

  for (const [messageId, perEmoji] of scratch) {
    const summary: MessageReactionSummary[] = [];
    for (const [emoji, { count, mine }] of perEmoji) {
      summary.push({ emoji, count, reacted_by_me: mine });
    }
    // Most-reacted first, stable within a tie.
    summary.sort((a, b) => b.count - a.count);
    byMessage.set(messageId, summary);
  }
  return byMessage;
}
