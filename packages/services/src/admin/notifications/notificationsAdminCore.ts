import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import type {
  AdminContext,
  NotificationAdminDetail,
  NotificationAdminListItem,
  NotificationBroadcastResult,
} from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { NotificationData } from "@abonten/types/notificationType";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationCore } from "../../notifications/createNotification";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin notification operations: browse every user's in-app notifications,
// re-send one to its recipient, and broadcast one to a segment. All reads
// go through the service-role client (the `notification` table is RLS
// owner-scoped). Every send / broadcast is written to admin_audit_log.

// Hard ceiling on an all-users broadcast so a fat-fingered send can't
// write millions of rows. Raise deliberately if the user base outgrows it.
const BROADCAST_MAX_RECIPIENTS = 50_000;
const INSERT_CHUNK = 500;
// A legitimate broadcast is a deliberate, occasional admin action -- this
// bounds a mis-click loop or a compromised admin session from spamming
// every user's notification feed repeatedly.
const MAX_BROADCASTS_PER_HOUR = 5;

export type ListNotificationsFilters = {
  type?: string | null;
  userId?: string | null;
  unreadOnly?: boolean;
  search?: string | null;
  cursor?: string | null;
  pageSize?: number;
};

export async function listNotificationsAdminCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  filters: ListNotificationsFilters,
): Promise<PaginatedResult<NotificationAdminListItem>> {
  try {
    assertPermission(ctx, "notifications.view");
  } catch (e) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: (e as Error).message,
    };
  }

  const pageSize = filters.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  let query = supabase
    .from("notification")
    .select(
      "id, user_id, type, title, body, link, image_public_id, read_at, created_at",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.userId) query = query.eq("user_id", filters.userId);
  if (filters.unreadOnly) query = query.is("read_at", null);
  if (filters.search?.trim()) {
    const s = filters.search.trim().replace(/[%,()]/g, "");
    query = query.or(`title.ilike.%${s}%,body.ilike.%${s}%`);
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listNotificationsAdminCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = data ?? [];
  const names = await recipientNames(
    supabase,
    rows.map((r) => r.user_id),
  );

  const mapped: NotificationAdminListItem[] = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    recipientName: names.get(r.user_id) ?? null,
    type: r.type,
    title: r.title,
    body: r.body ?? null,
    link: r.link ?? null,
    hasImage: Boolean(r.image_public_id),
    readAt: r.read_at ?? null,
    createdAt: r.created_at,
  }));

  const { page, hasNextPage } = splitPage<NotificationAdminListItem>(
    mapped,
    pageSize,
  );
  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.createdAt),
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}

export async function getNotificationAdminCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  id: string,
): Promise<AdminEnvelope<NotificationAdminDetail>> {
  try {
    assertPermission(ctx, "notifications.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data, error } = await supabase
    .from("notification")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logger.error(`getNotificationAdminCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!data) return { status: 404, message: "Notification not found" };

  const names = await recipientNames(supabase, [data.user_id]);
  let email: string | null = null;
  if (ctx.permissions.includes("users.view_pii")) {
    const { data: u } = await supabase.auth.admin.getUserById(data.user_id);
    email = u?.user?.email ?? null;
  }

  return {
    status: 200,
    data: {
      id: data.id,
      userId: data.user_id,
      recipientName: names.get(data.user_id) ?? null,
      recipientEmail: email,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      link: data.link ?? null,
      hasImage: Boolean(data.image_public_id),
      data: (data.data ?? {}) as Record<string, unknown>,
      imagePublicId: data.image_public_id ?? null,
      imageVersion: data.image_version ?? null,
      readAt: data.read_at ?? null,
      createdAt: data.created_at,
    },
  };
}

// Re-send an existing notification to the same recipient (a fresh row +
// best-effort push, via the shared createNotificationCore).
export async function resendNotificationCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: { id: string },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope<{ recipients: number }>> {
  try {
    assertPermission(ctx, "notifications.send");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: src, error } = await supabase
    .from("notification")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (error) {
    logger.error(`resendNotificationCore read failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!src) return { status: 404, message: "Notification not found" };

  const res = await createNotificationCore(supabase, {
    userId: src.user_id,
    type: src.type,
    title: src.title,
    body: src.body ?? null,
    link: src.link ?? null,
    data: (src.data ?? {}) as unknown as NotificationData,
    imagePublicId: src.image_public_id ?? null,
    imageVersion: src.image_version ?? null,
  });
  if (res.status !== 200) {
    return { status: res.status, message: res.message ?? "Resend failed" };
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "notification.resend",
    targetType: "notification",
    targetId: input.id,
    summary: `Re-sent "${src.title}" to ${src.user_id}`,
    after: { type: src.type, userId: src.user_id },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: "Notification re-sent.",
    data: { recipients: 1 },
  };
}

export type BroadcastSegment =
  | { kind: "all_users" }
  | { kind: "event_attendees"; eventId: string }
  | { kind: "single_user"; userId: string };

// Send one in-app notification to every user in a segment. In-app only —
// broadcasts do not fan out mobile pushes (that would hammer the Expo
// endpoint); a single_user send that wants a push should use resend.
export async function broadcastNotificationCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: {
    segment: BroadcastSegment;
    type: string;
    title: string;
    body?: string | null;
    link?: string | null;
  },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope<NotificationBroadcastResult>> {
  try {
    assertPermission(ctx, "notifications.broadcast");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const allowed = await checkRateLimit(
    `notification-broadcast:${ctx.userId}`,
    MAX_BROADCASTS_PER_HOUR,
    3600,
  );

  if (!allowed) {
    return {
      status: 429,
      message: "Too many broadcasts sent recently. Please try again later.",
    };
  }

  const resolved = await resolveRecipients(supabase, input.segment);
  if (!resolved.ok) {
    return { status: resolved.status, message: resolved.message };
  }
  const userIds = resolved.userIds;
  const label = resolved.label;
  if (userIds.length === 0) {
    return { status: 400, message: "That segment has no recipients." };
  }
  if (userIds.length > BROADCAST_MAX_RECIPIENTS) {
    return {
      status: 400,
      message: `Too many recipients (${userIds.length}). The cap is ${BROADCAST_MAX_RECIPIENTS}.`,
    };
  }

  const now = new Date().toISOString();
  for (let i = 0; i < userIds.length; i += INSERT_CHUNK) {
    const chunk = userIds.slice(i, i + INSERT_CHUNK).map((uid) => ({
      user_id: uid,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      data: {},
      created_at: now,
    }));
    const { error } = await supabase.from("notification").insert(chunk);
    if (error) {
      logger.error(
        `broadcastNotificationCore insert failed at offset ${i}: ${error.message}`,
      );
      return {
        status: 500,
        message: `Sent ${i} of ${userIds.length} before an error.`,
      };
    }
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "notification.broadcast",
    targetType: "notification_segment",
    targetId: label,
    summary: `Broadcast "${input.title}" to ${userIds.length} user(s) (${label})`,
    after: {
      segment: label,
      recipients: userIds.length,
      type: input.type,
    },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: `Sent to ${userIds.length} user(s).`,
    data: { recipients: userIds.length, segmentLabel: label },
  };
}

// ── helpers ─────────────────────────────────────────────────

async function recipientNames(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from("user_info")
    .select("id, username, full_name")
    .in("id", unique);
  for (const u of data ?? []) {
    map.set(u.id, u.full_name || u.username || `${u.id.slice(0, 8)}…`);
  }
  return map;
}

type ResolveResult =
  | { ok: true; userIds: string[]; label: string }
  | { ok: false; status: number; message: string };

async function resolveRecipients(
  supabase: SupabaseClient<Database>,
  segment: BroadcastSegment,
): Promise<ResolveResult> {
  if (segment.kind === "single_user") {
    const { data } = await supabase
      .from("user_info")
      .select("id")
      .eq("id", segment.userId)
      .maybeSingle();
    if (!data) return { ok: false, status: 404, message: "User not found." };
    return { ok: true, userIds: [segment.userId], label: "single user" };
  }

  if (segment.kind === "all_users") {
    // Fetch one row past the cap so an oversized user base is detected by
    // the BROADCAST_MAX_RECIPIENTS check below instead of the query itself
    // pulling every row (PostgREST would otherwise transfer the whole
    // table before that check ever runs).
    const { data, error } = await supabase
      .from("user_info")
      .select("id")
      .limit(BROADCAST_MAX_RECIPIENTS + 1);
    if (error)
      return { ok: false, status: 500, message: "Couldn't list users." };
    return {
      ok: true,
      userIds: (data ?? []).map((r) => r.id),
      label: "all users",
    };
  }

  // event_attendees
  const { data: types, error: tErr } = await supabase
    .from("ticket_type")
    .select("id")
    .eq("event_id", segment.eventId);
  if (tErr)
    return { ok: false, status: 500, message: "Couldn't read the event." };
  const typeIds = (types ?? []).map((t) => t.id);
  if (typeIds.length === 0) {
    return {
      ok: false,
      status: 400,
      message: "That event has no ticket types.",
    };
  }
  const { data: tickets, error: kErr } = await supabase
    .from("ticket")
    .select("user_id")
    .in("ticket_type_id", typeIds)
    .in("status", ["active", "used"])
    .limit(BROADCAST_MAX_RECIPIENTS + 1);
  if (kErr)
    return { ok: false, status: 500, message: "Couldn't read attendees." };
  const userIds = [...new Set((tickets ?? []).map((t) => t.user_id))].filter(
    Boolean,
  );
  return { ok: true, userIds, label: `event ${segment.eventId} attendees` };
}
