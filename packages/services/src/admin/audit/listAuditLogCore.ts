import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type { AdminContext, AuditLogEntry } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertPermission } from "../adminContext";

// Read-only view over the append-only admin_audit_log. Needs audit.view.

export type AuditLogFilters = {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  cursor?: string | null;
  pageSize?: number;
};

export async function listAuditLogCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  filters: AuditLogFilters = {},
): Promise<PaginatedResult<AuditLogEntry>> {
  try {
    assertPermission(ctx, "audit.view");
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
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.targetType) query = query.eq("target_type", filters.targetType);
  if (filters.targetId) query = query.eq("target_id", filters.targetId);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listAuditLogCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = data ?? [];
  const actorIds = [
    ...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)),
  ];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: users } = await supabase
      .from("user_info")
      .select("id, full_name, username")
      .in("id", actorIds);
    for (const u of users ?? [])
      names.set(u.id, u.full_name || u.username || u.id.slice(0, 8));
  }

  // before/after/requestMeta are the DB's generic Json column, wider than
  // AuditLogEntry's app-level Record<string, unknown> | null -- a
  // translation cast, not a real risk.
  const mapped = rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_id ? (names.get(r.actor_id) ?? null) : null,
    actorRoles: r.actor_roles ?? [],
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    summary: r.summary,
    reason: r.reason,
    before: r.before,
    after: r.after,
    requestMeta: r.request_meta,
    createdAt: r.created_at,
  })) as unknown as AuditLogEntry[];

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
