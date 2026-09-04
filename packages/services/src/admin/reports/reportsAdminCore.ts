import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type {
  AdminContext,
  AdminNoteEntry,
  ModeratableTargetType,
  ModerationActionKind,
  ReportCategory,
  ReportDetail,
  ReportGroupItem,
  ReportListItem,
  ReportPriority,
  ReportStatus,
  ReportTargetType,
  ReportTimelineEntry,
} from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// The Reports & Moderation workspace backend. Every function takes a
// SERVICE-ROLE client + a pre-resolved AdminContext (from
// resolveAdminContext in the transport) and re-checks the specific
// permission itself. Mutations are optimistic-concurrency guarded
// (expectedUpdatedAt) and audited.

const OPEN_STATUSES: ReportStatus[] = [
  "new",
  "under_review",
  "awaiting_info",
  "escalated",
];

const PRIORITY_ORDER: Record<ReportPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

// ─────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────

async function resolveActorNames(
  supabase: SupabaseClient<Database>,
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("user_info")
    .select("id, full_name, username")
    .in("id", unique);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.id, row.full_name || row.username || row.id.slice(0, 8));
  }
  return map;
}

const TARGET_SNAPSHOT: Record<
  ReportTargetType,
  { table: string; columns: string }
> = {
  event: {
    table: "event",
    columns:
      "id, title, slug, status, moderation_state, organizer_id, event_code",
  },
  place: {
    table: "place",
    columns: "id, name, slug, status, moderation_state, owner_id",
  },
  event_review: {
    table: "event_review",
    columns:
      "id, event_id, reviewer_id, rating, title, comment, status, moderation_state",
  },
  place_review: {
    table: "place_review",
    columns:
      "id, place_id, reviewer_id, rating, title, comment, status, moderation_state",
  },
  user_review: {
    table: "review",
    columns:
      "id, reviewer_id, reviewed_id, rating, title, comment, status, moderation_state",
  },
  user: {
    table: "user_info",
    columns: "id, username, full_name, bio, status_id, is_admin",
  },
  organizer: {
    table: "user_info",
    columns: "id, username, full_name, bio, status_id, is_admin",
  },
  highlight: {
    table: "highlight",
    columns: "id, user_id, content, media_type, media_url, moderation_state",
  },
};

async function fetchTargetSnapshot(
  supabase: SupabaseClient<Database>,
  targetType: ReportTargetType,
  targetId: string,
): Promise<Record<string, unknown> | null> {
  const map = TARGET_SNAPSHOT[targetType];
  // map.table/map.columns are resolved dynamically by targetType -- the
  // typed client can't narrow a query built from a table name that varies
  // at runtime; the function's own return type (a generic snapshot bag)
  // already reflects that this is intentionally untyped past this point.
  const { data, error } = await supabase
    .from(map.table as keyof Database["public"]["Tables"])
    .select(map.columns)
    .eq("id" as never, targetId)
    .maybeSingle();
  if (error) {
    logger.error(`fetchTargetSnapshot(${targetType}) failed: ${error.message}`);
    return null;
  }
  return (data as unknown as Record<string, unknown>) ?? null;
}

// ─────────────────────────────────────────────────────────────
// list (flat) + groups
// ─────────────────────────────────────────────────────────────

export type ListReportsFilters = {
  status?: ReportStatus | "open" | "all";
  priority?: ReportPriority;
  category?: ReportCategory;
  targetType?: ReportTargetType;
  assignedTo?: string | "unassigned" | "any";
  cursor?: string | null;
  pageSize?: number;
};

export async function listReportsCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  filters: ListReportsFilters = {},
): Promise<PaginatedResult<ReportListItem>> {
  try {
    assertPermission(ctx, "reports.view");
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
    .from("report")
    .select(
      "id, target_type, target_id, dedupe_key, category, status, priority, source, assigned_to, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (!filters.status || filters.status === "open") {
    query = query.in("status", OPEN_STATUSES);
  } else if (filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.targetType) query = query.eq("target_type", filters.targetType);
  if (filters.assignedTo === "unassigned")
    query = query.is("assigned_to", null);
  else if (filters.assignedTo && filters.assignedTo !== "any")
    query = query.eq("assigned_to", filters.assignedTo);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listReportsCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = data ?? [];
  const dedupeKeys = [...new Set(rows.map((r) => r.dedupe_key))];
  const countByKey = new Map<string, number>();
  if (dedupeKeys.length > 0) {
    const { data: groups } = await supabase
      .from("admin_report_group")
      .select("dedupe_key, report_count")
      .in("dedupe_key", dedupeKeys);
    for (const g of groups ?? []) {
      if (g.dedupe_key) countByKey.set(g.dedupe_key, Number(g.report_count));
    }
  }
  const names = await resolveActorNames(
    supabase,
    rows.map((r) => r.assigned_to),
  );

  // target_type/category/status/priority/source are DB CHECK-constrained
  // (see the report table's migration) to exactly these literal unions
  // though the columns themselves are text -- translation casts, not a
  // real risk.
  const mapped: ReportListItem[] = rows.map((r) => ({
    id: r.id,
    targetType: r.target_type as ReportTargetType,
    targetId: r.target_id,
    category: r.category as ReportCategory,
    status: r.status as ReportStatus,
    priority: r.priority as ReportPriority,
    source: r.source as ReportListItem["source"],
    assignedTo: r.assigned_to,
    assignedToName: r.assigned_to ? (names.get(r.assigned_to) ?? null) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    targetReportCount: r.dedupe_key ? (countByKey.get(r.dedupe_key) ?? 1) : 1,
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

export async function listReportGroupsCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  opts: { onlyOpen?: boolean; limit?: number } = {},
): Promise<AdminEnvelope<ReportGroupItem[]>> {
  try {
    assertPermission(ctx, "reports.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  let query = supabase
    .from("admin_report_group")
    .select("*")
    .order("priority_rank", { ascending: false })
    .order("latest_created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.onlyOpen) query = query.gt("open_count", 0);

  const { data, error } = await query;
  if (error) {
    logger.error(`listReportGroupsCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }

  const priorityFromRank = (rank: number): ReportPriority =>
    rank >= 4 ? "urgent" : rank === 3 ? "high" : rank === 2 ? "normal" : "low";

  return {
    status: 200,
    data: (data ?? []).map((g) => ({
      dedupeKey: g.dedupe_key,
      targetType: g.target_type,
      targetId: g.target_id,
      reportCount: Number(g.report_count),
      openCount: Number(g.open_count),
      highestPriority: priorityFromRank(Number(g.priority_rank)),
      latestCreatedAt: g.latest_created_at,
      categories: g.categories ?? [],
    })) as unknown as ReportGroupItem[],
  };
}

// ─────────────────────────────────────────────────────────────
// detail
// ─────────────────────────────────────────────────────────────

export async function getReportDetailCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  reportId: string,
  opts: { signAttachment?: (path: string) => Promise<string | null> } = {},
): Promise<AdminEnvelope<ReportDetail>> {
  try {
    assertPermission(ctx, "reports.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: r, error } = await supabase
    .from("report")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  if (error) {
    logger.error(`getReportDetailCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!r) return { status: 404, message: "Report not found" };

  const canPii = ctx.permissions.includes("users.view_pii");

  // reporter
  let reporter: ReportDetail["reporter"] = {
    id: r.reporter_id,
    username: null,
    fullName: null,
    email: null,
    priorReportsByReporter: 0,
  };
  if (r.reporter_id) {
    const { data: ru } = await supabase
      .from("user_info")
      .select("id, username, full_name")
      .eq("id", r.reporter_id)
      .maybeSingle();
    const { count: priorByReporter } = await supabase
      .from("report")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", r.reporter_id);
    let email: string | null = null;
    if (canPii) {
      const { data: authUser } = await supabase.auth.admin.getUserById(
        r.reporter_id,
      );
      email = authUser?.user?.email ?? null;
    }
    reporter = {
      id: r.reporter_id,
      username: ru?.username ?? null,
      fullName: ru?.full_name ?? null,
      email,
      priorReportsByReporter: priorByReporter ?? 0,
    };
  }

  const [
    { data: timelineRows },
    { data: noteRows },
    { data: attachmentRows },
    { count: priorOnTarget },
  ] = await Promise.all([
    supabase
      .from("report_event")
      .select("id, kind, actor_id, data, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true }),
    supabase
      .from("admin_note")
      .select("id, author_id, body, created_at")
      .eq("target_type", "report")
      .eq("target_id", reportId)
      .order("created_at", { ascending: true }),
    supabase
      .from("report_attachment")
      .select("id, storage_path, file_name, mime_type, size_bytes")
      .eq("report_id", reportId),
    supabase
      .from("report")
      .select("id", { count: "exact", head: true })
      .eq("dedupe_key", r.dedupe_key),
  ]);

  const actorNames = await resolveActorNames(supabase, [
    ...(timelineRows ?? []).map((t) => t.actor_id),
    ...(noteRows ?? []).map((n) => n.author_id),
    r.assigned_to,
  ]);

  // kind is DB CHECK-constrained to exactly ReportTimelineEntry's literal
  // union though the column itself is text, and `data`/report_event's Json
  // column is wider than the app-level Record<string, unknown> -- a
  // translation cast, not a real risk.
  const timeline = [
    {
      id: `${reportId}-created`,
      kind: "created" as const,
      actorId: r.reporter_id,
      actorName: reporter.fullName || reporter.username || null,
      data: { category: r.category, source: r.source },
      createdAt: r.created_at,
    },
    ...(timelineRows ?? []).map((t) => ({
      id: t.id,
      kind: t.kind,
      actorId: t.actor_id,
      actorName: t.actor_id ? (actorNames.get(t.actor_id) ?? null) : null,
      data: t.data,
      createdAt: t.created_at,
    })),
  ] as unknown as ReportTimelineEntry[];

  const notes: AdminNoteEntry[] = (noteRows ?? []).map((n) => ({
    id: n.id,
    authorId: n.author_id,
    authorName: n.author_id ? (actorNames.get(n.author_id) ?? null) : null,
    body: n.body,
    createdAt: n.created_at,
  }));

  const attachments = await Promise.all(
    (attachmentRows ?? []).map(async (a) => ({
      id: a.id,
      fileName: a.file_name,
      mimeType: a.mime_type,
      sizeBytes: a.size_bytes,
      url: opts.signAttachment
        ? await opts.signAttachment(a.storage_path)
        : null,
    })),
  );

  const snapshot = await fetchTargetSnapshot(
    supabase,
    r.target_type as ReportTargetType,
    r.target_id,
  );

  return {
    status: 200,
    data: {
      id: r.id,
      // Same DB-CHECK-constrained-text-vs-literal-union translation as
      // listReportsCore above.
      targetType: r.target_type as ReportTargetType,
      targetId: r.target_id,
      category: r.category as ReportCategory,
      details: r.details,
      status: r.status as ReportStatus,
      priority: r.priority as ReportPriority,
      source: r.source as ReportDetail["source"],
      assignedTo: r.assigned_to,
      assignedToName: r.assigned_to
        ? (actorNames.get(r.assigned_to) ?? null)
        : null,
      resolution: r.resolution,
      resolutionAction: r.resolution_action,
      resolvedBy: r.resolved_by,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      reporter,
      targetSnapshot: snapshot,
      priorReportsOnTarget: priorOnTarget ?? 1,
      timeline,
      notes,
      attachments,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// mutations
// ─────────────────────────────────────────────────────────────

type ConcurrencyOpts = { expectedUpdatedAt?: string };

async function guardConcurrency(
  supabase: SupabaseClient<Database>,
  reportId: string,
  expectedUpdatedAt: string | undefined,
): Promise<
  | { ok: true; current: Record<string, unknown> }
  | { ok: false; envelope: AdminEnvelope }
> {
  const { data, error } = await supabase
    .from("report")
    .select(
      "id, status, updated_at, assigned_to, dedupe_key, target_type, target_id, priority",
    )
    .eq("id", reportId)
    .maybeSingle();
  if (error || !data) {
    return {
      ok: false,
      envelope: { status: 404, message: "Report not found" },
    };
  }
  if (expectedUpdatedAt && data.updated_at !== expectedUpdatedAt) {
    return {
      ok: false,
      envelope: {
        status: 409,
        message:
          "This report was changed by someone else. Reload to see the latest.",
      },
    };
  }
  return { ok: true, current: data };
}

function meta(ctx: AdminContext, requestMeta?: Record<string, unknown>) {
  return { ...(requestMeta ?? {}), roles: ctx.roles };
}

export async function assignReportCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: { reportId: string; assigneeId: string | null } & ConcurrencyOpts,
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "reports.assign");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const guard = await guardConcurrency(
    supabase,
    input.reportId,
    input.expectedUpdatedAt,
  );
  if (!guard.ok) return guard.envelope;

  if (input.assigneeId) {
    const { data: assignee } = await supabase
      .from("admin_user")
      .select("user_id, status")
      .eq("user_id", input.assigneeId)
      .maybeSingle();
    if (!assignee || assignee.status !== "active") {
      return {
        status: 400,
        message: "That assignee is not an active administrator.",
      };
    }
  }

  const { error } = await supabase
    .from("report")
    .update({ assigned_to: input.assigneeId })
    .eq("id", input.reportId);
  if (error) {
    logger.error(`assignReportCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }

  await supabase.from("report_event").insert({
    report_id: input.reportId,
    actor_id: ctx.userId,
    kind: "assigned",
    data: { assignee_id: input.assigneeId },
  });
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "report.assign",
    targetType: "report",
    targetId: input.reportId,
    summary: input.assigneeId
      ? `Assigned report to ${input.assigneeId}`
      : "Unassigned report",
    before: { assigned_to: guard.current.assigned_to },
    after: { assigned_to: input.assigneeId },
    requestMeta: meta(ctx, requestMeta),
  });
  return { status: 200, message: "Report assignment updated." };
}

export async function updateReportStatusCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: {
    reportId: string;
    status: Extract<
      ReportStatus,
      "new" | "under_review" | "awaiting_info" | "escalated"
    >;
  } & ConcurrencyOpts,
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(
      ctx,
      input.status === "escalated"
        ? "reports.escalate"
        : "reports.update_status",
    );
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const guard = await guardConcurrency(
    supabase,
    input.reportId,
    input.expectedUpdatedAt,
  );
  if (!guard.ok) return guard.envelope;
  if (
    (["resolved", "dismissed", "false_report"] as string[]).includes(
      String(guard.current.status),
    )
  ) {
    return { status: 409, message: "This report is already closed." };
  }

  const { error } = await supabase
    .from("report")
    .update({ status: input.status })
    .eq("id", input.reportId);
  if (error) {
    logger.error(`updateReportStatusCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  await supabase.from("report_event").insert({
    report_id: input.reportId,
    actor_id: ctx.userId,
    kind: input.status === "escalated" ? "escalated" : "status_changed",
    data: {
      from: guard.current.status,
      to: input.status,
    } as unknown as Database["public"]["Tables"]["report_event"]["Insert"]["data"],
  });
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action:
      input.status === "escalated" ? "report.escalate" : "report.status_change",
    targetType: "report",
    targetId: input.reportId,
    summary: `Report status ${guard.current.status} -> ${input.status}`,
    before: { status: guard.current.status },
    after: { status: input.status },
    requestMeta: meta(ctx, requestMeta),
  });
  return { status: 200, message: "Report updated." };
}

export async function requestReportInfoCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: { reportId: string; message: string } & ConcurrencyOpts,
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "reports.request_info");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const guard = await guardConcurrency(
    supabase,
    input.reportId,
    input.expectedUpdatedAt,
  );
  if (!guard.ok) return guard.envelope;

  const { error } = await supabase
    .from("report")
    .update({ status: "awaiting_info" })
    .eq("id", input.reportId);
  if (error) {
    logger.error(`requestReportInfoCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  await supabase.from("report_event").insert({
    report_id: input.reportId,
    actor_id: ctx.userId,
    kind: "info_requested",
    data: { message: input.message },
  });
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "report.request_info",
    targetType: "report",
    targetId: input.reportId,
    summary: "Requested more information",
    reason: input.message,
    requestMeta: meta(ctx, requestMeta),
  });
  return { status: 200, message: "Marked as awaiting information." };
}

export async function addAdminNoteCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: { targetType: string; targetId: string; body: string },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "reports.note");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const { error } = await supabase.from("admin_note").insert({
    author_id: ctx.userId,
    target_type: input.targetType,
    target_id: input.targetId,
    body: input.body.trim(),
  });
  if (error) {
    logger.error(`addAdminNoteCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (input.targetType === "report") {
    await supabase.from("report_event").insert({
      report_id: input.targetId,
      actor_id: ctx.userId,
      kind: "note_added",
      data: null,
    });
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "admin_note.add",
    targetType: input.targetType,
    targetId: input.targetId,
    summary: "Added internal note",
    requestMeta: meta(ctx, requestMeta),
  });
  return { status: 200, message: "Note added." };
}

export async function resolveReportCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: {
    reportId: string;
    status: Extract<ReportStatus, "resolved" | "dismissed" | "false_report">;
    resolution: string;
    resolutionAction?: string;
  } & ConcurrencyOpts,
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(
      ctx,
      input.status === "false_report"
        ? "reports.mark_false"
        : "reports.resolve",
    );
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const guard = await guardConcurrency(
    supabase,
    input.reportId,
    input.expectedUpdatedAt,
  );
  if (!guard.ok) return guard.envelope;

  const { data: rpcResult, error } = await supabase.rpc("resolve_report", {
    p_report_id: input.reportId,
    p_actor_id: ctx.userId,
    p_status: input.status,
    p_resolution: input.resolution,
    p_action: input.resolutionAction ?? null,
  } as unknown as Database["public"]["Functions"]["resolve_report"]["Args"]);
  if (error) {
    logger.error(`resolveReportCore RPC failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  const result = rpcResult as {
    resolved: boolean;
    noop: boolean;
    status: string;
  };
  if (result.noop) {
    return { status: 409, message: `This report is already ${result.status}.` };
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "report.resolve",
    targetType: "report",
    targetId: input.reportId,
    summary: `Report ${guard.current.status} -> ${input.status}`,
    reason: input.resolution,
    before: { status: guard.current.status },
    after: { status: input.status, action: input.resolutionAction ?? null },
    requestMeta: meta(ctx, requestMeta),
  });
  return { status: 200, message: "Report resolved." };
}

// ─────────────────────────────────────────────────────────────
// Bulk: resolve every open report on one target ("resolve all N")
// ─────────────────────────────────────────────────────────────

const MODERATABLE_SET = new Set<string>([
  "event",
  "place",
  "event_review",
  "place_review",
  "user_review",
  "highlight",
]);

export async function resolveReportGroupCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: {
    dedupeKey: string;
    status: Extract<ReportStatus, "resolved" | "dismissed" | "false_report">;
    resolution: string;
    resolutionAction?: string;
    /** optionally apply ONE moderation action to the shared target first */
    moderation?: { action: ModerationActionKind; reason: string };
  },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope<{ resolved: number; moderated: boolean }>> {
  try {
    assertPermission(
      ctx,
      input.status === "false_report"
        ? "reports.mark_false"
        : "reports.resolve",
    );
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const OPEN: ReportStatus[] = [
    "new",
    "under_review",
    "awaiting_info",
    "escalated",
  ];
  const { data: open, error } = await supabase
    .from("report")
    .select("id, target_type, target_id, status")
    .eq("dedupe_key", input.dedupeKey)
    .in("status", OPEN);
  if (error) {
    logger.error(`resolveReportGroupCore fetch failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!open || open.length === 0) {
    return { status: 409, message: "No open reports on this target." };
  }

  const first = open[0];
  let moderated = false;

  if (input.moderation) {
    if (!MODERATABLE_SET.has(first.target_type)) {
      return {
        status: 400,
        message: "That target type can't be moderated from here.",
      };
    }
    const permForAction: Record<ModerationActionKind, string> = {
      hide: "moderation.hide",
      unhide: "moderation.restore",
      remove: "moderation.remove",
      restore: "moderation.restore",
      restrict: "moderation.restrict",
      unrestrict: "moderation.restrict",
    };
    try {
      assertPermission(
        ctx,
        permForAction[input.moderation.action] as Parameters<
          typeof assertPermission
        >[1],
      );
    } catch (e) {
      return { status: 403, message: (e as Error).message };
    }
    const { error: modErr } = await supabase.rpc("apply_moderation_action", {
      p_actor_id: ctx.userId,
      p_target_type: first.target_type as ModeratableTargetType,
      p_target_id: first.target_id,
      p_action: input.moderation.action,
      p_reason: input.moderation.reason,
      p_report_id: first.id,
      p_idempotency_key: `${first.target_type}:${first.target_id}:${input.moderation.action}:group:${input.dedupeKey}`,
    });
    if (modErr) {
      logger.error(
        `resolveReportGroupCore moderation failed: ${modErr.message}`,
      );
      return { status: 500, message: "Moderation action failed" };
    }
    moderated = true;
  }

  let resolved = 0;
  for (const r of open) {
    const { data: rpcResult, error: rErr } = await supabase.rpc(
      "resolve_report",
      {
        p_report_id: r.id,
        p_actor_id: ctx.userId,
        p_status: input.status,
        p_resolution: input.resolution,
        p_action: input.resolutionAction ?? null,
      } as unknown as Database["public"]["Functions"]["resolve_report"]["Args"],
    );
    if (rErr) {
      logger.error(
        `resolveReportGroupCore resolve ${r.id} failed: ${rErr.message}`,
      );
      continue;
    }
    const res = rpcResult as { noop: boolean };
    if (!res.noop) resolved += 1;
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "report.resolve_group",
    targetType: first.target_type,
    targetId: first.target_id,
    summary: `Bulk-resolved ${resolved} report(s) on ${input.dedupeKey} -> ${input.status}`,
    reason: input.resolution,
    after: {
      dedupe_key: input.dedupeKey,
      status: input.status,
      moderated,
      moderation_action: input.moderation?.action ?? null,
    },
    requestMeta: meta(ctx, requestMeta),
  });

  return {
    status: 200,
    message: `Resolved ${resolved} report(s)${moderated ? " and moderated the content" : ""}.`,
    data: { resolved, moderated },
  };
}
