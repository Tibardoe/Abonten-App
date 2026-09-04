import { logger } from "@abonten/core/logger";
import type { ErrorEventPayload } from "@abonten/core/reportError";
import type {
  AdminContext,
  ErrorEventSample,
  ErrorGroup,
  ErrorGroupStatus,
  HealthCheckKey,
  HealthCheckSnapshot,
  Incident,
  MetricsOverviewPoint,
  ObservedPlatform,
} from "@abonten/types/adminTypes";
import type { Database, Json } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// ── WRITE side (hybrid observability pipeline) ────────────────
// These run on the service-role client from the ingest route handlers.
// The app_error_group rollup is maintained by a DB trigger.

export async function ingestErrorCore(
  serviceClient: SupabaseClient<Database>,
  payload: ErrorEventPayload,
): Promise<{ status: number }> {
  const { error } = await serviceClient.from("app_error_event").insert({
    fingerprint: payload.fingerprint,
    error_type: payload.errorType,
    message: payload.message,
    stack: payload.stack,
    platform: payload.platform,
    release: payload.release,
    route: payload.route,
    app_version: payload.appVersion,
    severity: payload.severity,
    // Record<string, unknown> is a wider type than Json (its values aren't
    // guaranteed JSON-safe) -- the ingest route only ever forwards an
    // already-JSON-serialized payload, so this is a translation cast, not
    // a real risk.
    context: payload.context as unknown as Json,
    user_id: payload.userId,
    occurred_at: payload.occurredAt,
  });
  if (error) {
    logger.error(`ingestErrorCore failed: ${error.message}`);
    return { status: 500 };
  }
  return { status: 202 };
}

export type RequestMetricInput = {
  platform: ObservedPlatform;
  route: string | null;
  method: string | null;
  statusCode: number | null;
  durationMs: number | null;
  ok: boolean;
};

export async function ingestMetricCore(
  serviceClient: SupabaseClient<Database>,
  input: RequestMetricInput,
): Promise<{ status: number }> {
  const { error } = await serviceClient.from("app_request_metric").insert({
    platform: input.platform,
    route: input.route,
    method: input.method,
    status_code: input.statusCode,
    duration_ms: input.durationMs,
    ok: input.ok,
  });
  if (error) {
    logger.error(`ingestMetricCore failed: ${error.message}`);
    return { status: 500 };
  }
  return { status: 202 };
}

export type HealthCheckOutcome = {
  key: HealthCheckKey;
  ok: boolean;
  latencyMs: number | null;
  detail: Record<string, unknown> | null;
};

export async function recordHealthResultsCore(
  serviceClient: SupabaseClient<Database>,
  results: HealthCheckOutcome[],
): Promise<{ status: number }> {
  if (results.length === 0) return { status: 200 };
  const { error } = await serviceClient.from("health_check_result").insert(
    results.map((r) => ({
      check_key: r.key,
      ok: r.ok,
      latency_ms: r.latencyMs,
      // Same Record<string, unknown>-vs-Json translation as ingestErrorCore.
      detail: r.detail as unknown as Json,
    })),
  );
  if (error) {
    logger.error(`recordHealthResultsCore failed: ${error.message}`);
    return { status: 500 };
  }
  return { status: 200 };
}

// ── READ side (Admin Monitoring module) ──────────────────────

export async function getHealthSnapshotCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
): Promise<AdminEnvelope<HealthCheckSnapshot[]>> {
  try {
    assertPermission(ctx, "monitoring.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const { data, error } = await supabase
    .from("health_check_result")
    .select("check_key, ok, latency_ms, detail, checked_at")
    .order("checked_at", { ascending: false })
    .limit(300);
  if (error) {
    logger.error(`getHealthSnapshotCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  const seen = new Set<string>();
  const out: HealthCheckSnapshot[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.check_key)) continue;
    seen.add(row.check_key);
    out.push({
      // check_key is free-text in the DB but only ever populated from the
      // fixed set of health checks this project runs -- HealthCheckKey is
      // that closed set at the app-model boundary.
      key: row.check_key as HealthCheckKey,
      ok: row.ok,
      latencyMs: row.latency_ms,
      detail: row.detail as Record<string, unknown> | null,
      checkedAt: row.checked_at,
    });
  }
  return { status: 200, data: out };
}

export async function listErrorGroupsCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  filters: { status?: ErrorGroupStatus | "all"; limit?: number } = {},
): Promise<AdminEnvelope<ErrorGroup[]>> {
  try {
    assertPermission(ctx, "monitoring.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  let query = supabase
    .from("app_error_group")
    .select("*")
    .order("last_seen", { ascending: false })
    .limit(filters.limit ?? 100);
  if (filters.status && filters.status !== "all")
    query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) {
    logger.error(`listErrorGroupsCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  return {
    status: 200,
    // platforms/status are free-text columns constrained by the app to a
    // known set (ObservedPlatform / ErrorGroupStatus) -- the DB doesn't
    // encode that as an enum, so this is a translation cast, not a real
    // risk.
    data: (data ?? []).map((g) => ({
      fingerprint: g.fingerprint,
      title: g.title,
      errorType: g.error_type,
      sampleMessage: g.sample_message,
      firstSeen: g.first_seen,
      lastSeen: g.last_seen,
      eventCount: Number(g.event_count),
      platforms: g.platforms ?? [],
      lastRoute: g.last_route,
      lastAppVersion: g.last_app_version,
      status: g.status,
      assignedTo: g.assigned_to,
    })) as unknown as ErrorGroup[],
  };
}

export async function getErrorGroupCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  fingerprint: string,
): Promise<AdminEnvelope<{ group: ErrorGroup; samples: ErrorEventSample[] }>> {
  try {
    assertPermission(ctx, "monitoring.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const [{ data: g, error: gErr }, { data: samples, error: sErr }] =
    await Promise.all([
      supabase
        .from("app_error_group")
        .select("*")
        .eq("fingerprint", fingerprint)
        .maybeSingle(),
      supabase
        .from("app_error_event")
        .select(
          "id, message, stack, platform, route, app_version, severity, context, occurred_at",
        )
        .eq("fingerprint", fingerprint)
        .order("occurred_at", { ascending: false })
        .limit(25),
    ]);
  if (gErr || sErr) {
    logger.error(`getErrorGroupCore failed: ${gErr?.message ?? sErr?.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!g) return { status: 404, message: "Error group not found" };
  return {
    status: 200,
    data: {
      // Same free-text-constrained-to-a-known-set translation as
      // listErrorGroupsCore above.
      group: {
        fingerprint: g.fingerprint,
        title: g.title,
        errorType: g.error_type,
        sampleMessage: g.sample_message,
        firstSeen: g.first_seen,
        lastSeen: g.last_seen,
        eventCount: Number(g.event_count),
        platforms: g.platforms ?? [],
        lastRoute: g.last_route,
        lastAppVersion: g.last_app_version,
        status: g.status,
        assignedTo: g.assigned_to,
      } as unknown as ErrorGroup,
      samples: (samples ?? []).map((s) => ({
        id: s.id,
        message: s.message,
        stack: s.stack,
        platform: s.platform,
        route: s.route,
        appVersion: s.app_version,
        severity: s.severity,
        context: s.context,
        occurredAt: s.occurred_at,
      })) as unknown as ErrorEventSample[],
    },
  };
}

export async function updateErrorGroupStatusCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: { fingerprint: string; status: ErrorGroupStatus },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "monitoring.manage");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const { error } = await supabase
    .from("app_error_group")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("fingerprint", input.fingerprint);
  if (error) {
    logger.error(`updateErrorGroupStatusCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "error_group.status",
    targetType: "error_group",
    targetId: input.fingerprint,
    summary: `Error group -> ${input.status}`,
    after: { status: input.status },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: `Marked ${input.status}.` };
}

export async function getMetricsOverviewCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  opts: { sinceHours?: number } = {},
): Promise<AdminEnvelope<MetricsOverviewPoint[]>> {
  try {
    assertPermission(ctx, "monitoring.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const since = new Date(
    Date.now() - (opts.sinceHours ?? 24) * 3_600_000,
  ).toISOString();
  const { data, error } = await supabase
    .from("app_request_metric_hourly")
    .select("*")
    .gte("bucket", since)
    .order("bucket", { ascending: true });
  if (error) {
    logger.error(`getMetricsOverviewCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  return {
    status: 200,
    data: (data ?? []).map((r) => ({
      bucket: r.bucket,
      platform: r.platform,
      total: Number(r.total),
      okCount: Number(r.ok_count),
      errCount: Number(r.err_count),
      p50Ms: r.p50_ms,
      p95Ms: r.p95_ms,
    })) as unknown as MetricsOverviewPoint[],
  };
}

export async function listIncidentsCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
): Promise<AdminEnvelope<Incident[]>> {
  try {
    assertPermission(ctx, "monitoring.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const { data, error } = await supabase
    .from("incident")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(100);
  if (error) {
    logger.error(`listIncidentsCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  return {
    status: 200,
    // status/severity are DB CHECK-constrained (see the incident table's
    // migration) to exactly Incident's literal unions -- a translation
    // cast, not a real risk.
    data: (data ?? []).map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      severity: i.severity,
      component: i.component,
      summary: i.summary,
      startedAt: i.started_at,
      resolvedAt: i.resolved_at,
      createdBy: i.created_by,
      updatedAt: i.updated_at,
    })) as unknown as Incident[],
  };
}

export async function upsertIncidentCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: {
    id?: string;
    title: string;
    status: Incident["status"];
    severity: Incident["severity"];
    component?: string | null;
    summary?: string | null;
  },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope<{ id: string }>> {
  try {
    assertPermission(ctx, "incidents.manage");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const row = {
    title: input.title,
    status: input.status,
    severity: input.severity,
    component: input.component ?? null,
    summary: input.summary ?? null,
    resolved_at: input.status === "resolved" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  let id = input.id;
  if (id) {
    const { error } = await supabase.from("incident").update(row).eq("id", id);
    if (error) {
      logger.error(`upsertIncidentCore update failed: ${error.message}`);
      return { status: 500, message: "Something went wrong" };
    }
  } else {
    const { data, error } = await supabase
      .from("incident")
      .insert({ ...row, created_by: ctx.userId })
      .select("id")
      .single();
    if (error || !data) {
      logger.error(`upsertIncidentCore insert failed: ${error?.message}`);
      return { status: 500, message: "Something went wrong" };
    }
    id = data.id;
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: input.id ? "incident.update" : "incident.create",
    targetType: "incident",
    targetId: id,
    summary: `${input.title} (${input.status})`,
    after: row,
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message: "Incident saved.",
    data: { id: id as string },
  };
}
