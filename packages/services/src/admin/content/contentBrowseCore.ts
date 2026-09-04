import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type {
  AdminContext,
  AdminPermissionKey,
  ModeratableContentItem,
  ModeratableTargetType,
  ModerationState,
} from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type AdminEnvelope, assertPermission } from "../adminContext";

// The content-moderation browse queue (Phase 2). One list per moderatable
// entity type, showing each row's current moderation_state, owner, and how
// many reports point at it. The ACTIONS (hide / remove / restore / …) are
// unchanged — they still go through applyModerationActionCore /
// apply_moderation_action; this module is read-only.

type Cfg = {
  table: string;
  labelCol: string;
  ownerCol: string;
  statusCol: string | null;
  /** how a report row references this entity */
  reportTargetType: string;
  permission: AdminPermissionKey;
};

const CFG: Record<ModeratableTargetType, Cfg> = {
  event: {
    table: "event",
    labelCol: "title",
    ownerCol: "organizer_id",
    statusCol: "status",
    reportTargetType: "event",
    permission: "events.view",
  },
  place: {
    table: "place",
    labelCol: "name",
    ownerCol: "owner_id",
    statusCol: "status",
    reportTargetType: "place",
    permission: "places.view",
  },
  event_review: {
    table: "event_review",
    labelCol: "comment",
    ownerCol: "reviewer_id",
    statusCol: "status",
    reportTargetType: "event_review",
    permission: "reviews.view",
  },
  place_review: {
    table: "place_review",
    labelCol: "comment",
    ownerCol: "reviewer_id",
    statusCol: "status",
    reportTargetType: "place_review",
    permission: "reviews.view",
  },
  user_review: {
    table: "review",
    labelCol: "comment",
    ownerCol: "reviewer_id",
    statusCol: "status",
    reportTargetType: "user_review",
    permission: "reviews.view",
  },
  highlight: {
    table: "highlight",
    labelCol: "content",
    ownerCol: "user_id",
    statusCol: null,
    reportTargetType: "highlight",
    permission: "reviews.view",
  },
};

export type ContentStateFilter =
  | "actioned"
  | "hidden"
  | "removed"
  | "restricted"
  | "any";

export type ListContentFilters = {
  targetType: ModeratableTargetType;
  state?: ContentStateFilter;
  search?: string;
  cursor?: string | null;
  pageSize?: number;
};

export async function listModeratableContentCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  filters: ListContentFilters,
): Promise<PaginatedResult<ModeratableContentItem>> {
  const cfg = CFG[filters.targetType];
  try {
    assertPermission(ctx, cfg.permission);
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
  const state = filters.state ?? "actioned";

  const cols = [
    "id",
    cfg.labelCol,
    cfg.ownerCol,
    "moderation_state",
    "moderated_at",
    "created_at",
    ...(cfg.statusCol ? [cfg.statusCol] : []),
  ].join(", ");

  let query = supabase
    .from(cfg.table as keyof Database["public"]["Tables"])
    .select(cols)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (state === "actioned")
    query = query.not("moderation_state" as never, "is", null);
  else if (state !== "any")
    query = query.eq("moderation_state" as never, state);

  if (filters.search?.trim()) {
    const s = filters.search.trim().replace(/[%,()]/g, "");
    query = query.ilike(cfg.labelCol, `%${s}%`);
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(
      `listModeratableContentCore(${filters.targetType}) failed: ${error.message}`,
    );
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = rows.map((r) => r.id as string);

  // report counts (batched)
  const reportCountById = new Map<string, number>();
  if (ids.length > 0) {
    const { data: reps } = await supabase
      .from("report")
      .select("target_id")
      .eq("target_type", cfg.reportTargetType)
      .in("target_id", ids);
    for (const r of reps ?? []) {
      const k = r.target_id as string;
      reportCountById.set(k, (reportCountById.get(k) ?? 0) + 1);
    }
  }

  // owner names (batched)
  const ownerIds = [
    ...new Set(
      rows
        .map((r) => r[cfg.ownerCol] as string)
        .filter((x): x is string => !!x),
    ),
  ];
  const ownerName = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: us } = await supabase
      .from("user_info")
      .select("id, full_name, username")
      .in("id", ownerIds);
    for (const u of us ?? [])
      ownerName.set(u.id, u.full_name || u.username || u.id.slice(0, 8));
  }

  const snippet = (v: unknown): string => {
    const s = typeof v === "string" ? v : "";
    return s.length > 80 ? `${s.slice(0, 80)}…` : s || "(no text)";
  };

  const mapped: ModeratableContentItem[] = rows.map((r) => {
    const owner = (r[cfg.ownerCol] as string) ?? null;
    return {
      targetType: filters.targetType,
      id: r.id as string,
      label: snippet(r[cfg.labelCol]),
      ownerId: owner,
      ownerName: owner ? (ownerName.get(owner) ?? null) : null,
      moderationState: (r.moderation_state as ModerationState) ?? null,
      moderatedAt: (r.moderated_at as string) ?? null,
      status: cfg.statusCol ? ((r[cfg.statusCol] as string) ?? null) : null,
      reportCount: reportCountById.get(r.id as string) ?? 0,
      createdAt: r.created_at as string,
    };
  });

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

/** Counts per moderation_state for the queue header chips. */
export async function contentModerationCountsCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  targetType: ModeratableTargetType,
): Promise<AdminEnvelope<Record<string, number>>> {
  const cfg = CFG[targetType];
  try {
    assertPermission(ctx, cfg.permission);
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const out: Record<string, number> = {
    hidden: 0,
    removed: 0,
    restricted: 0,
  };
  for (const s of ["hidden", "removed", "restricted"] as const) {
    const { count } = await supabase
      .from(cfg.table as keyof Database["public"]["Tables"])
      .select("id", { count: "exact", head: true })
      .eq("moderation_state" as never, s);
    out[s] = count ?? 0;
  }
  return { status: 200, data: out };
}
