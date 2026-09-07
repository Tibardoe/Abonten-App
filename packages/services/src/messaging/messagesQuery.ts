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
  options?: { cursor?: string | null; pageSize?: number },
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
  const { page, hasNextPage } = splitPage(rows, pageSize);

  const messageIds = page.map((m) => m.id);
  const replyIds = [
    ...new Set(
      page
        .map((m) => m.reply_to_message_id)
        .filter((id): id is string => id != null),
    ),
  ];

  const [attachmentsByMessage, replyPreviews] = await Promise.all([
    loadAttachments(supabase, messageIds),
    loadReplyPreviews(supabase, replyIds),
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

  for (const row of (data ?? []) as MessageReplyPreview[]) {
    byId.set(row.id, row.deleted_at ? { ...row, content: null } : row);
  }
  return byId;
}
