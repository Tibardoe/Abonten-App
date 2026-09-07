import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type {
  ConversationContext,
  ConversationFilter,
  ConversationListItem,
  ConversationParticipantProfile,
  ConversationParticipantRow,
  ConversationRoleScope,
  MessagingEnvelope,
} from "@abonten/types/messagingType";
import type { SupabaseClient } from "@supabase/supabase-js";

// Read side of the inbox, shared by the web actions and the
// /api/mobile/messages routes. All three functions run on the caller's own
// session client:
//   * list_conversations / get_unread_conversation_count are SECURITY
//     DEFINER RPCs that scope to auth.uid() internally.
//   * getConversationContext reads the conversation + its participants +
//     subject through RLS, so a non-participant gets nothing (-> 404).

type ListCursor = { ts: string; id: string };

function decodeListCursor(raw: string | null | undefined): ListCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    return parsed &&
      typeof parsed.ts === "string" &&
      typeof parsed.id === "string"
      ? (parsed as ListCursor)
      : null;
  } catch {
    return null;
  }
}

function encodeListCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export async function fetchConversationsPage(
  supabase: SupabaseClient<Database>,
  _userId: string,
  options?: {
    filter?: ConversationFilter;
    roleScope?: ConversationRoleScope;
    cursor?: string | null;
    pageSize?: number;
  },
): Promise<{
  status: number;
  data: ConversationListItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
  message?: string;
}> {
  const filter = options?.filter ?? "active";
  const roleScope = options?.roleScope ?? "all";
  const pageSize = Math.min(Math.max(options?.pageSize ?? 20, 1), 50);
  const cursor = decodeListCursor(options?.cursor);

  const { data, error } = await supabase.rpc("list_conversations", {
    p_filter: filter,
    p_role_scope: roleScope,
    p_cursor_ts: cursor?.ts ?? undefined,
    p_cursor_id: cursor?.id ?? undefined,
    p_limit: pageSize + 1,
  } as Database["public"]["Functions"]["list_conversations"]["Args"]);

  if (error) {
    logger.error(`fetchConversationsPage failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  let rows = (data ?? []) as ConversationListItem[];

  // The RPC's 'unread' filter narrows to active conversations; the actual
  // "has unread" test is applied here so the SQL stays a plain projection.
  if (filter === "unread") {
    rows = rows.filter((r) => r.unread_count > 0);
  }

  const hasNextPage = rows.length > pageSize;
  const page = hasNextPage ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last?.last_message_at
      ? encodeListCursor({ ts: last.last_message_at, id: last.conversation_id })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}

export async function getUnreadMessageCount(
  supabase: SupabaseClient<Database>,
  _userId: string,
): Promise<{ status: 200 | 500; count: number; message?: string }> {
  const { data, error } = await supabase.rpc("get_unread_conversation_count");

  if (error) {
    logger.error(`getUnreadMessageCount failed: ${error.message}`);
    return { status: 500, count: 0, message: "Something went wrong!" };
  }

  return { status: 200, count: (data as number | null) ?? 0 };
}

export async function getConversationContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  conversationId: string,
): Promise<MessagingEnvelope<ConversationContext>> {
  const { data: conv, error: convErr } = await supabase
    .from("conversation")
    .select("id, type, status, title, moderation_state, event_id, place_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (convErr) {
    logger.error(
      `getConversationContext: conversation read failed: ${convErr.message}`,
    );
    return { status: 500, message: "Something went wrong. Please try again." };
  }
  if (!conv) {
    // RLS hides conversations the caller isn't in — treat as not found.
    return { status: 404, message: "Conversation not found." };
  }
  if (conv.moderation_state !== "visible") {
    // Hidden / removed / restricted by a moderator (Phase 8) — the thread is
    // no longer reachable from the chat UI. Staff act on it from the admin
    // report workspace, not here.
    return { status: 404, message: "Conversation not found." };
  }

  const { data: participantRows, error: partErr } = await supabase
    .from("conversation_participant")
    .select("user_id, role, last_read_at, muted, archived, left_at")
    .eq("conversation_id", conversationId);

  if (partErr) {
    logger.error(
      `getConversationContext: participants read failed: ${partErr.message}`,
    );
    return { status: 500, message: "Something went wrong. Please try again." };
  }

  const participants = (participantRows ?? []) as ConversationParticipantRow[];
  const mine = participants.find((p) => p.user_id === userId);
  if (!mine) {
    return { status: 404, message: "Conversation not found." };
  }

  const profileIds = participants.map((p) => p.user_id);
  const { data: profileRows } = await supabase
    .from("user_info")
    .select("id, full_name, username, avatar_public_id, avatar_version")
    .in("id", profileIds);
  const profileById = new Map(
    ((profileRows ?? []) as ConversationParticipantProfile[]).map((p) => [
      p.id,
      p,
    ]),
  );

  const [eventCtx, placeCtx] = await Promise.all([
    conv.event_id ? loadEventContext(supabase, conv.event_id) : null,
    conv.place_id ? loadPlaceContext(supabase, conv.place_id) : null,
  ]);

  const { data: blocks } = await supabase
    .from("conversation_block")
    .select("blocked_id")
    .eq("blocker_id", userId);
  const blockedIds = ((blocks ?? []) as { blocked_id: string }[]).map(
    (b) => b.blocked_id,
  );

  return {
    status: 200,
    data: {
      id: conv.id,
      type: conv.type as ConversationContext["type"],
      status: conv.status as "open" | "closed",
      title: conv.title,
      moderation_state:
        conv.moderation_state as ConversationContext["moderation_state"],
      subject: { event: eventCtx, place: placeCtx },
      my_participant: mine,
      participants: participants.map((p) => ({
        ...p,
        profile: profileById.get(p.user_id) ?? null,
      })),
      blocked_user_ids: blockedIds,
    },
  };
}

async function loadEventContext(
  supabase: SupabaseClient<Database>,
  eventId: string,
) {
  const { data } = await supabase
    .from("event")
    .select("id, title, slug, event_code, starts_at, status, address")
    .eq("id", eventId)
    .maybeSingle();
  return data
    ? {
        id: data.id,
        title: data.title,
        slug: data.slug,
        event_code: data.event_code,
        starts_at: data.starts_at,
        status: data.status,
        address: data.address,
      }
    : null;
}

async function loadPlaceContext(
  supabase: SupabaseClient<Database>,
  placeId: string,
) {
  const { data } = await supabase
    .from("place")
    .select("id, name, slug, status, address")
    .eq("id", placeId)
    .maybeSingle();
  return data
    ? {
        id: data.id,
        name: data.name,
        slug: data.slug,
        status: data.status,
        address: data.address,
      }
    : null;
}
