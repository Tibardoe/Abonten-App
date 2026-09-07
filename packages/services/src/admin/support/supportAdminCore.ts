import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type {
  AdminContext,
  AdminNoteEntry,
  SupportConversationDetail,
  SupportConversationListItem,
  SupportMessageEntry,
  SupportQueueScope,
} from "@abonten/types/adminTypes";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { createNotificationCore } from "../../notifications/createNotification";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// In-app support queue (Admin Console). A support conversation is a
// public.conversation with type='support'; its only participant is the
// requester (role='member'). The agent who works it is tracked on
// conversation.assigned_to and is deliberately NOT added as a participant —
// the requester's thread renders every non-self message as "Abonten
// Support" (bubbles carry no sender identity) and getConversationContext
// builds its participant list from conversation_participant rows, so the
// agent's name / avatar never reaches them.
//
// Reads run on the service-role client (RLS bypassed). Writes are guarded
// direct table writes — the same pattern claimsAdminCore uses for claim
// rejection — never message content into the audit log.

const NOTE_TARGET = "support_conversation";

async function resolveNames(
  supabase: ServiceRoleClient,
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("user_info")
    .select("id, full_name, username")
    .in("id", unique);
  const map = new Map<string, string>();
  for (const r of data ?? [])
    map.set(r.id, r.full_name || r.username || r.id.slice(0, 8));
  return map;
}

function preview(body: string): string {
  const s = body.trim().replace(/\s+/g, " ");
  return s.length > 140 ? `${s.slice(0, 139)}…` : s;
}

export type ListSupportFilters = {
  scope?: SupportQueueScope;
  cursor?: string | null;
  pageSize?: number;
};

export async function listSupportConversationsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: ListSupportFilters = {},
): Promise<PaginatedResult<SupportConversationListItem>> {
  try {
    assertPermission(ctx, "support.view");
  } catch (e) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: (e as Error).message,
    };
  }

  const scope = filters.scope ?? "unassigned";
  const pageSize = filters.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  let query = supabase
    .from("conversation")
    .select(
      "id, status, created_by, assigned_to, last_message_at, last_message_preview, last_message_sender_id, created_at",
    )
    .eq("type", "support")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (scope === "unassigned") {
    query = query.is("assigned_to", null).eq("status", "open");
  } else if (scope === "mine") {
    query = query.eq("assigned_to", ctx.userId);
  } else if (scope === "open") {
    query = query.eq("status", "open");
  } else if (scope === "closed") {
    query = query.eq("status", "closed");
  }

  if (cursor) {
    query = query.or(keysetOlderThan("last_message_at", "id", cursor));
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listSupportConversationsCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = data ?? [];
  const ids = rows.map((r) => r.id as string);

  const names = await resolveNames(supabase, [
    ...rows.map((r) => r.created_by as string | null),
    ...rows.map((r) => r.assigned_to as string | null),
  ]);

  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: msgRows } = await supabase
      .from("message")
      .select("conversation_id")
      .in("conversation_id", ids)
      .neq("message_type", "system")
      .is("deleted_at", null);
    for (const m of msgRows ?? []) {
      const k = m.conversation_id as string;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }

  const mapped: SupportConversationListItem[] = rows.map((r) => {
    const requesterId = r.created_by as string;
    const lastSender = r.last_message_sender_id as string | null;
    return {
      id: r.id as string,
      status: (r.status as "open" | "closed") ?? "open",
      requesterId,
      requesterName: names.get(requesterId) ?? null,
      assignedToId: (r.assigned_to as string) ?? null,
      assignedToName: r.assigned_to
        ? (names.get(r.assigned_to as string) ?? null)
        : null,
      lastMessageAt: (r.last_message_at as string) ?? null,
      lastMessagePreview: (r.last_message_preview as string) ?? null,
      awaitingReply:
        (r.status ?? "open") === "open" &&
        (lastSender === null || lastSender === requesterId),
      messageCount: counts.get(r.id as string) ?? 0,
      createdAt: r.created_at as string,
    };
  });

  const { page, hasNextPage } = splitPage(mapped, pageSize);
  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.lastMessageAt ?? last.createdAt),
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}

export async function getSupportConversationDetailCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  conversationId: string,
): Promise<AdminEnvelope<SupportConversationDetail>> {
  try {
    assertPermission(ctx, "support.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: conv, error } = await supabase
    .from("conversation")
    .select(
      "id, type, status, created_by, assigned_to, assigned_at, created_at",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    logger.error(`getSupportConversationDetailCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!conv || conv.type !== "support") {
    return { status: 404, message: "Support conversation not found" };
  }

  const requesterId = conv.created_by as string;
  const canPii = ctx.permissions.includes("users.view_pii");

  const [{ data: requester }, { data: msgRows }, { data: noteRows }] =
    await Promise.all([
      supabase
        .from("user_info")
        .select("id, username, full_name")
        .eq("id", requesterId)
        .maybeSingle(),
      supabase
        .from("message")
        .select(
          "id, sender_id, message_type, content, system_event, created_at, edited_at, deleted_at",
        )
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(300),
      supabase
        .from("admin_note")
        .select("id, author_id, body, created_at")
        .eq("target_type", NOTE_TARGET)
        .eq("target_id", conversationId)
        .order("created_at", { ascending: true }),
    ]);

  let requesterEmail: string | null = null;
  if (canPii) {
    const { data: authUser } =
      await supabase.auth.admin.getUserById(requesterId);
    requesterEmail = authUser?.user?.email ?? null;
  }

  const names = await resolveNames(supabase, [
    conv.assigned_to as string | null,
    ...(noteRows ?? []).map((n) => n.author_id as string | null),
  ]);

  const messages: SupportMessageEntry[] = (msgRows ?? []).map((m) => {
    const senderId = (m.sender_id as string) ?? null;
    const author: SupportMessageEntry["author"] =
      m.message_type === "system"
        ? "system"
        : senderId === requesterId
          ? "requester"
          : "support";
    return {
      id: m.id as string,
      author,
      senderId,
      body: m.deleted_at ? null : ((m.content as string) ?? null),
      systemEvent: (m.system_event as string) ?? null,
      createdAt: m.created_at as string,
      editedAt: (m.edited_at as string) ?? null,
      deletedAt: (m.deleted_at as string) ?? null,
    };
  });

  const notes: AdminNoteEntry[] = (noteRows ?? []).map((n) => ({
    id: n.id as string,
    authorId: (n.author_id as string) ?? null,
    authorName: n.author_id ? (names.get(n.author_id as string) ?? null) : null,
    body: n.body as string,
    createdAt: n.created_at as string,
  }));

  return {
    status: 200,
    data: {
      id: conv.id as string,
      status: (conv.status as "open" | "closed") ?? "open",
      createdAt: conv.created_at as string,
      requester: {
        id: requesterId,
        username: requester?.username ?? null,
        fullName: requester?.full_name ?? null,
        email: requesterEmail,
      },
      assignedToId: (conv.assigned_to as string) ?? null,
      assignedToName: conv.assigned_to
        ? (names.get(conv.assigned_to as string) ?? null)
        : null,
      assignedAt: (conv.assigned_at as string) ?? null,
      messages,
      notes,
    },
  };
}

async function loadSupportConversation(
  supabase: ServiceRoleClient,
  conversationId: string,
) {
  const { data, error } = await supabase
    .from("conversation")
    .select("id, type, status, created_by, assigned_to")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data && data.type === "support" ? data : null;
}

export async function assignSupportConversationCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { conversationId: string; assigneeId: string | null },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "support.respond");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  let conv: Awaited<ReturnType<typeof loadSupportConversation>>;
  try {
    conv = await loadSupportConversation(supabase, input.conversationId);
  } catch (e) {
    logger.error(`assignSupportConversationCore fetch failed: ${e}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!conv) return { status: 404, message: "Support conversation not found" };

  if (input.assigneeId) {
    const { data: agent } = await supabase
      .from("admin_user")
      .select("user_id, status")
      .eq("user_id", input.assigneeId)
      .maybeSingle();
    if (!agent || agent.status !== "active") {
      return {
        status: 400,
        message: "That person is not an active administrator.",
      };
    }
  }

  const { error: updErr } = await supabase
    .from("conversation")
    .update({
      assigned_to: input.assigneeId,
      assigned_at: input.assigneeId ? new Date().toISOString() : null,
      assigned_by: input.assigneeId ? ctx.userId : null,
    })
    .eq("id", input.conversationId)
    .eq("type", "support");
  if (updErr) {
    logger.error(
      `assignSupportConversationCore update failed: ${updErr.message}`,
    );
    return { status: 500, message: "Something went wrong" };
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: input.assigneeId ? "support.assign" : "support.unassign",
    targetType: NOTE_TARGET,
    targetId: input.conversationId,
    summary: input.assigneeId
      ? input.assigneeId === ctx.userId
        ? "Claimed support conversation"
        : "Assigned support conversation"
      : "Unassigned support conversation",
    before: { assigned_to: (conv.assigned_to as string) ?? null },
    after: { assigned_to: input.assigneeId },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: input.assigneeId ? "Assigned." : "Unassigned.",
  };
}

export async function replySupportConversationCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { conversationId: string; body: string },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope<{ messageId: string }>> {
  try {
    assertPermission(ctx, "support.respond");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const body = input.body.trim();
  if (!body) return { status: 400, message: "A reply is required" };
  if (body.length > 4000)
    return { status: 400, message: "That reply is too long" };

  let conv: Awaited<ReturnType<typeof loadSupportConversation>>;
  try {
    conv = await loadSupportConversation(supabase, input.conversationId);
  } catch (e) {
    logger.error(`replySupportConversationCore fetch failed: ${e}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!conv) return { status: 404, message: "Support conversation not found" };

  const { data: inserted, error: insErr } = await supabase
    .from("message")
    .insert({
      conversation_id: input.conversationId,
      sender_id: ctx.userId,
      message_type: "text",
      content: body,
    })
    .select("id, created_at")
    .single();
  if (insErr || !inserted) {
    logger.error(
      `replySupportConversationCore insert failed: ${insErr?.message}`,
    );
    return { status: 500, message: "Something went wrong" };
  }

  // Denormalized conversation state (send_message maintains this by hand —
  // there is no trigger). Replying also reopens a closed thread and claims
  // an unassigned one for this agent.
  const now = new Date().toISOString();
  const claim = conv.assigned_to
    ? {}
    : { assigned_to: ctx.userId, assigned_at: now, assigned_by: ctx.userId };
  const { error: updErr } = await supabase
    .from("conversation")
    .update({
      last_message_at: inserted.created_at,
      last_message_preview: preview(body),
      last_message_sender_id: ctx.userId,
      status: "open",
      updated_at: now,
      ...claim,
    })
    .eq("id", input.conversationId);
  if (updErr) {
    logger.error(
      `replySupportConversationCore conversation update failed: ${updErr.message}`,
    );
  }

  // Notify the requester as "Abonten Support" — never the agent's name.
  await createNotificationCore(supabase, {
    userId: conv.created_by as string,
    type: "message",
    title: "Abonten Support",
    body: preview(body),
    link: `/messages/${input.conversationId}`,
    data: { kind: "message", conversationId: input.conversationId },
  });

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "support.reply",
    targetType: NOTE_TARGET,
    targetId: input.conversationId,
    // No message content in the audit row (see CLAUDE.md — no message
    // content in logs / analytics).
    summary: "Replied to support conversation",
    after: { message_id: inserted.id, requester_id: conv.created_by },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: "Reply sent.",
    data: { messageId: inserted.id as string },
  };
}

export async function setSupportConversationStatusCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { conversationId: string; status: "open" | "closed" },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "support.respond");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  let conv: Awaited<ReturnType<typeof loadSupportConversation>>;
  try {
    conv = await loadSupportConversation(supabase, input.conversationId);
  } catch (e) {
    logger.error(`setSupportConversationStatusCore fetch failed: ${e}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!conv) return { status: 404, message: "Support conversation not found" };
  if (conv.status === input.status) {
    return {
      status: 200,
      message: input.status === "closed" ? "Already closed." : "Already open.",
    };
  }

  const { error: updErr } = await supabase
    .from("conversation")
    .update({
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.conversationId)
    .eq("type", "support");
  if (updErr) {
    logger.error(
      `setSupportConversationStatusCore update failed: ${updErr.message}`,
    );
    return { status: 500, message: "Something went wrong" };
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: input.status === "closed" ? "support.close" : "support.reopen",
    targetType: NOTE_TARGET,
    targetId: input.conversationId,
    summary:
      input.status === "closed"
        ? "Closed support conversation"
        : "Reopened support conversation",
    before: { status: conv.status },
    after: { status: input.status },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: input.status === "closed" ? "Closed." : "Reopened.",
  };
}
