import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type {
  AdminContext,
  AdminUserDetail,
  AdminUserListItem,
  ReportListItem,
  UserAccountStatus,
} from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// The Users module backend. Safe admin overview + soft-state account
// actions (suspend / ban / restore). No hard delete — financial and
// ticketing history stays auditable (spec §12).

const STATUS_ID: Record<UserAccountStatus, number> = {
  Active: 1,
  Suspended: 2,
  Banned: 3,
};
const STATUS_NAME: Record<number, UserAccountStatus> = {
  1: "Active",
  2: "Suspended",
  3: "Banned",
};

export type ListUsersFilters = {
  search?: string;
  status?: UserAccountStatus;
  isAdmin?: boolean;
  joinedFrom?: string;
  joinedTo?: string;
  cursor?: string | null;
  pageSize?: number;
};

export async function listUsersCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  filters: ListUsersFilters = {},
): Promise<PaginatedResult<AdminUserListItem>> {
  try {
    assertPermission(ctx, "users.view");
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
    .from("user_info")
    .select("id, username, full_name, status_id, is_admin, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (filters.search?.trim()) {
    const s = filters.search.trim().replace(/[%,()]/g, "");
    query = query.or(`username.ilike.%${s}%,full_name.ilike.%${s}%`);
  }
  if (filters.status) query = query.eq("status_id", STATUS_ID[filters.status]);
  if (typeof filters.isAdmin === "boolean")
    query = query.eq("is_admin", filters.isAdmin);
  if (filters.joinedFrom) query = query.gte("created_at", filters.joinedFrom);
  if (filters.joinedTo) query = query.lte("created_at", filters.joinedTo);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listUsersCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = data ?? [];
  const ids = rows.map((r) => r.id);

  // per-user aggregate counts, batched (no row loads)
  const [eventsByOrg, reportsByTarget] = await Promise.all([
    countGroup(supabase, "event", "organizer_id", ids),
    countReportsAgainst(supabase, ids),
  ]);

  const canPii = ctx.permissions.includes("users.view_pii");
  const emailById = canPii
    ? await emailsFor(supabase, ids)
    : new Map<string, string>();

  const mapped: AdminUserListItem[] = rows.map((r) => ({
    id: r.id,
    username: r.username,
    fullName: r.full_name,
    email: emailById.get(r.id) ?? null,
    status: STATUS_NAME[r.status_id] ?? "Active",
    isAdmin: r.is_admin,
    createdAt: r.created_at,
    eventCount: eventsByOrg.get(r.id) ?? 0,
    reportsAgainstCount: reportsByTarget.get(r.id) ?? 0,
  }));

  const { page, hasNextPage } = splitPage(mapped, pageSize);
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

async function countGroup(
  supabase: SupabaseClient<Database>,
  table: string,
  column: string,
  ids: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  // one count query per id would be N round-trips; instead pull the id column
  // for the small page set and tally in memory (page is <= pageSize rows of ids).
  const { data } = await supabase
    .from(table as keyof Database["public"]["Tables"])
    .select(column)
    .in(column as never, ids);
  for (const row of (data ?? []) as unknown as Record<string, string>[]) {
    const key = row[column];
    if (key) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

async function countReportsAgainst(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("report")
    .select("target_id")
    .in("target_type", ["user", "organizer"])
    .in("target_id", ids);
  for (const row of data ?? []) {
    map.set(row.target_id, (map.get(row.target_id) ?? 0) + 1);
  }
  return map;
}

async function emailsFor(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const { data } = await supabase.auth.admin.getUserById(id);
      if (data?.user?.email) map.set(id, data.user.email);
    }),
  );
  return map;
}

export async function getUserDetailCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  userId: string,
): Promise<AdminEnvelope<AdminUserDetail>> {
  try {
    assertPermission(ctx, "users.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: ui, error } = await supabase
    .from("user_info")
    .select(
      "id, username, full_name, bio, website, avatar_public_id, status_id, is_admin, created_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    logger.error(`getUserDetailCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!ui) return { status: 404, message: "User not found" };

  const canPii = ctx.permissions.includes("users.view_pii");
  let email: string | null = null;
  let phone: string | null = null;
  let lastSignInAt: string | null = null;
  let authCreatedAt: string | null = ui.created_at;
  if (canPii) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    email = authUser?.user?.email ?? null;
    phone = authUser?.user?.phone ?? null;
    lastSignInAt = authUser?.user?.last_sign_in_at ?? null;
    authCreatedAt = authUser?.user?.created_at ?? ui.created_at;
  }

  const [
    { count: eventsOrganized },
    { count: ticketsPurchased },
    { count: reviewsWritten },
    { count: reportsFiled },
    { count: reportsAgainst },
    { count: claimsFiled },
    { data: recent },
  ] = await Promise.all([
    supabase
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", userId),
    supabase
      .from("ticket")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("review")
      .select("id", { count: "exact", head: true })
      .eq("reviewer_id", userId),
    supabase
      .from("report")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", userId),
    supabase
      .from("report")
      .select("id", { count: "exact", head: true })
      .in("target_type", ["user", "organizer"])
      .eq("target_id", userId),
    supabase
      .from("place_claim_request")
      .select("id", { count: "exact", head: true })
      .eq("claimant_id", userId),
    supabase
      .from("report")
      .select(
        "id, target_type, target_id, dedupe_key, category, status, priority, source, assigned_to, created_at, updated_at",
      )
      .in("target_type", ["user", "organizer"])
      .eq("target_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const recentReportsAgainst = (recent ?? []).map((r) => ({
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    category: r.category,
    status: r.status,
    priority: r.priority,
    source: r.source,
    assignedTo: r.assigned_to,
    assignedToName: null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    targetReportCount: reportsAgainst ?? 0,
  })) as unknown as ReportListItem[];

  return {
    status: 200,
    data: {
      id: ui.id,
      username: ui.username,
      fullName: ui.full_name,
      bio: ui.bio,
      website: ui.website,
      avatarPublicId: ui.avatar_public_id,
      status: STATUS_NAME[ui.status_id] ?? "Active",
      isAdmin: ui.is_admin,
      email,
      phone,
      createdAt: authCreatedAt,
      lastSignInAt,
      stats: {
        eventsOrganized: eventsOrganized ?? 0,
        ticketsPurchased: ticketsPurchased ?? 0,
        reviewsWritten: reviewsWritten ?? 0,
        reportsFiled: reportsFiled ?? 0,
        reportsAgainst: reportsAgainst ?? 0,
        claimsFiled: claimsFiled ?? 0,
      },
      recentReportsAgainst,
    },
  };
}

export async function setUserStatusCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: {
    userId: string;
    status: UserAccountStatus;
    reason: string;
    reportId?: string | null;
    expectedStatus?: UserAccountStatus;
  },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  const needed =
    input.status === "Banned"
      ? "users.ban"
      : input.status === "Active"
        ? "users.restore"
        : "users.suspend";
  try {
    assertPermission(ctx, needed);
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: current, error: readErr } = await supabase
    .from("user_info")
    .select("id, status_id, is_admin")
    .eq("id", input.userId)
    .maybeSingle();
  if (readErr || !current) return { status: 404, message: "User not found" };

  const currentStatus = STATUS_NAME[current.status_id] ?? "Active";
  if (input.expectedStatus && input.expectedStatus !== currentStatus) {
    return {
      status: 409,
      message: `This account is now ${currentStatus}. Reload before acting.`,
    };
  }
  if (currentStatus === input.status) {
    return { status: 200, message: `Account is already ${input.status}.` };
  }
  if (current.is_admin && input.status !== "Active") {
    return {
      status: 400,
      message:
        "Remove this person's admin roles before suspending or banning them.",
    };
  }

  const { error } = await supabase
    .from("user_info")
    .update({ status_id: STATUS_ID[input.status] })
    .eq("id", input.userId)
    .eq("status_id", current.status_id); // optimistic concurrency at the DB
  if (error) {
    logger.error(`setUserStatusCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: `user.status.${input.status.toLowerCase()}`,
    targetType: "user",
    targetId: input.userId,
    summary: `Account ${currentStatus} -> ${input.status}`,
    reason: input.reason,
    before: { status: currentStatus },
    after: { status: input.status },
    requestMeta: {
      ...(requestMeta ?? {}),
      roles: ctx.roles,
      report_id: input.reportId ?? null,
    },
  });

  if (input.reportId) {
    await supabase.from("report_event").insert({
      report_id: input.reportId,
      actor_id: ctx.userId,
      kind: "action_taken",
      data: {
        action: `user_status_${input.status.toLowerCase()}`,
        user_id: input.userId,
      },
    });
  }

  return { status: 200, message: `Account ${input.status.toLowerCase()}.` };
}
