import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { logger } from "@abonten/core/logger";
import { WEEKLY_VALIDITY_LABEL } from "@abonten/core/weekly/copy";
import {
  sanitizeWeeklyLine,
  sanitizeWeeklyOptional,
} from "@abonten/core/weekly/editorialText";
import {
  WEEKLY_DEFAULT_TEMPLATE,
  sectionAccepts,
  weeklySectionKind,
} from "@abonten/core/weekly/sectionKinds";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  WeeklyAdminEdition,
  WeeklyEditionListRow,
  WeeklyEditionStatus,
  WeeklySubjectOption,
  WeeklySubjectScope,
  WeeklyValidation,
  WeeklyValidityReason,
} from "@abonten/types/weeklyType";
import type {
  AddWeeklyItemInput,
  AddWeeklySectionInput,
  CreateWeeklyEditionInput,
  UpdateWeeklyEditionInput,
  UpdateWeeklyItemInput,
  UpdateWeeklySectionInput,
  WeeklyTransitionInput,
} from "@abonten/validation/weeklySchemas";
import {
  mapWeeklyAdminDocument,
  mapWeeklyValidation,
} from "../../weekly/weeklyDocument";
import { createWeeklyPreviewToken } from "../../weekly/weeklyPreview";
import { readWeeklySettings } from "../../weekly/weeklyProgram";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin > Weekly: editions, sections, items and the publishing lifecycle.
//
// Permissions: weekly.view reads; weekly.edit creates and changes editions,
// sections and items, and archives/restores; weekly.publish schedules,
// publishes and unpublishes (step-up, checked by the admin transport).
//
// Concurrency: every change to an edition's content first claims the next
// version with weekly_claim_edit(expectedVersion). If another admin saved in
// between, the claim fails and the caller gets 409 with nothing changed.
// Checks that can refuse a request run BEFORE the claim, so a refused
// request never burns a version. Every successful change returns the new
// version and writes an admin_audit_log entry.

type RequestMeta = Record<string, unknown> | undefined;

const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

type Versioned = { version: number };

const DB_ERRORS: Record<string, { status: number; message: string }> = {
  weekly_version_conflict: {
    status: 409,
    message:
      "Someone else changed this edition. Reload to see their changes, then try again.",
  },
  weekly_edition_archived: {
    status: 409,
    message: "This edition is archived. Restore it before editing.",
  },
  weekly_edition_not_found: {
    status: 404,
    message: "This edition no longer exists.",
  },
  weekly_edition_exists: {
    status: 409,
    message: "There is already an edition for this area and week.",
  },
  weekly_scope_inactive: {
    status: 400,
    message: "That area is retired. Pick an active area.",
  },
  weekly_week_not_monday: {
    status: 400,
    message: "Pick the Monday that starts the week.",
  },
  weekly_invalid_transition: {
    status: 409,
    message: "That action is not possible from the edition's current status.",
  },
  weekly_schedule_in_past: {
    status: 400,
    message: "Choose a publishing time in the future.",
  },
  weekly_reorder_mismatch: {
    status: 409,
    message:
      "The list changed while you were reordering. Reload and try again.",
  },
  weekly_item_not_found: {
    status: 404,
    message: "That listing is no longer in this edition.",
  },
  weekly_section_not_in_edition: {
    status: 400,
    message: "That section belongs to a different edition.",
  },
  weekly_item_duplicate: {
    status: 409,
    message: "That listing is already in the section.",
  },
};

function dbError<T>(
  error: { message: string; code?: string } | null,
  context: string,
): AdminEnvelope<T> {
  const known = error
    ? Object.entries(DB_ERRORS).find(([key]) => error.message.includes(key))
    : undefined;
  if (known) return known[1] as AdminEnvelope<T>;
  if (error?.code === "23505") {
    return { status: 409, message: "That listing is already in the section." };
  }
  logger.error(`${context} failed: ${error?.message ?? "unknown error"}`);
  return { status: 500, message: "Something went wrong. Please try again." };
}

/** Same ids, each exactly once (a reorder must name every row). */
function sameSet(current: string[], proposed: string[]): boolean {
  return (
    current.length === proposed.length &&
    new Set(proposed).size === proposed.length &&
    proposed.every((id) => current.includes(id))
  );
}

async function claim(
  supabase: ServiceRoleClient,
  editionId: string,
  expectedVersion: number,
): Promise<{ version: number } | { error: AdminEnvelope<never> }> {
  const { data, error } = await supabase.rpc("weekly_claim_edit", {
    p_edition_id: editionId,
    p_expected_version: expectedVersion,
  });
  if (error || typeof data !== "number") {
    return { error: dbError<never>(error, "weekly_claim_edit") };
  }
  return { version: data };
}

async function audit(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  requestMeta: RequestMeta,
  entry: {
    action: string;
    targetType: string;
    targetId: string;
    summary: string;
    reason?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
) {
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    ...entry,
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
}

// ── Reads ────────────────────────────────────────────────────────────

export async function listWeeklyEditionsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    status?: WeeklyEditionStatus;
    scopeId?: string;
    limit?: number;
  } = {},
): Promise<AdminEnvelope<WeeklyEditionListRow[]>> {
  try {
    assertPermission(ctx, "weekly.view");
  } catch (e) {
    return denied(e);
  }
  let query = supabase
    .from("weekly_edition")
    .select(
      "id, scope_id, week_start, status, title, scheduled_for, published_at, version, updated_at, weekly_scope(slug, name), weekly_section(count), weekly_item(count)",
    )
    .order("week_start", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 100));
  if (input.status) query = query.eq("status", input.status);
  if (input.scopeId) query = query.eq("scope_id", input.scopeId);

  const { data, error } = await query;
  if (error) return dbError(error, "listWeeklyEditionsCore");

  const count = (v: unknown) =>
    Array.isArray(v) && v[0] && typeof v[0].count === "number" ? v[0].count : 0;

  return {
    status: 200,
    data: (data ?? []).map((row) => {
      const scope = row.weekly_scope as { slug: string; name: string } | null;
      return {
        id: row.id,
        scopeId: row.scope_id,
        scopeSlug: scope?.slug ?? "",
        scopeName: scope?.name ?? "",
        weekStart: row.week_start,
        status: row.status as WeeklyEditionStatus,
        title: row.title,
        scheduledFor: row.scheduled_for,
        publishedAt: row.published_at,
        itemCount: count(row.weekly_item),
        sectionCount: count(row.weekly_section),
        version: row.version,
        updatedAt: row.updated_at,
      };
    }),
  };
}

export async function getWeeklyEditionAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  editionId: string,
): Promise<AdminEnvelope<WeeklyAdminEdition>> {
  try {
    assertPermission(ctx, "weekly.view");
  } catch (e) {
    return denied(e);
  }
  const [doc, validation] = await Promise.all([
    supabase.rpc("weekly_edition_document", {
      p_edition_id: editionId,
      p_admin: true,
    }),
    supabase.rpc("weekly_edition_validation", { p_edition_id: editionId }),
  ]);
  if (doc.error) return dbError(doc.error, "weekly_edition_document");
  if (validation.error) {
    return dbError(validation.error, "weekly_edition_validation");
  }
  const mapped = mapWeeklyAdminDocument(doc.data, validation.data);
  if (!mapped)
    return { status: 404, message: "This edition no longer exists." };
  return { status: 200, data: mapped };
}

// ── Editions ─────────────────────────────────────────────────────────

export async function createWeeklyEditionCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: CreateWeeklyEditionInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ id: string }>> {
  try {
    assertPermission(ctx, "weekly.edit");
  } catch (e) {
    return denied(e);
  }
  const title = sanitizeWeeklyLine(input.title);
  if (!title) return { status: 400, message: "Give the edition a title." };

  const { data: id, error } = await supabase.rpc("weekly_edition_create", {
    p_actor: ctx.userId,
    p_scope_id: input.scopeId,
    p_week_start: input.weekStart,
    p_title: title,
    p_subtitle: sanitizeWeeklyOptional(input.subtitle) as string,
    p_intro: sanitizeWeeklyOptional(input.intro, true) as string,
    p_duplicate_from: (input.duplicateFrom ?? null) as string,
  });
  if (error || !id) return dbError(error, "weekly_edition_create");

  if (!input.duplicateFrom && input.useTemplate) {
    const rows = WEEKLY_DEFAULT_TEMPLATE.map((kind, position) => {
      const def = weeklySectionKind(kind);
      return {
        edition_id: id,
        position,
        kind,
        subject_scope: def?.subjectScope ?? "mixed",
        layout: def?.defaultLayout ?? "carousel",
        title: def?.defaultTitle ?? "Section",
        subtitle: def?.defaultSubtitle ?? null,
        icon_key: def?.defaultIconKey ?? null,
      };
    });
    const { error: sectionError } = await supabase
      .from("weekly_section")
      .insert(rows);
    if (sectionError) {
      logger.error(
        `createWeeklyEditionCore template sections failed: ${sectionError.message}`,
      );
    }
  }

  await audit(supabase, ctx, requestMeta, {
    action: input.duplicateFrom
      ? "weekly.edition.duplicate"
      : "weekly.edition.create",
    targetType: "weekly_edition",
    targetId: id,
    summary: `Abonten Weekly edition created for the week of ${input.weekStart}: ${title}`,
    after: {
      scopeId: input.scopeId,
      weekStart: input.weekStart,
      title,
      duplicatedFrom: input.duplicateFrom ?? null,
    },
  });
  return { status: 200, message: "Edition created.", data: { id } };
}

export async function updateWeeklyEditionCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: UpdateWeeklyEditionInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<Versioned>> {
  try {
    assertPermission(ctx, "weekly.edit");
  } catch (e) {
    return denied(e);
  }
  const update: Record<string, string | null> = {};
  if (input.patch.title !== undefined) {
    const title = sanitizeWeeklyLine(input.patch.title);
    if (!title) return { status: 400, message: "Give the edition a title." };
    update.title = title;
  }
  if (input.patch.subtitle !== undefined) {
    update.subtitle = sanitizeWeeklyOptional(input.patch.subtitle);
  }
  if (input.patch.intro !== undefined) {
    update.intro = sanitizeWeeklyOptional(input.patch.intro, true);
  }
  if (Object.keys(update).length === 0) {
    return { status: 400, message: "Nothing changed." };
  }

  const { data: before } = await supabase
    .from("weekly_edition")
    .select("title, subtitle, intro")
    .eq("id", input.editionId)
    .maybeSingle();
  if (!before)
    return { status: 404, message: "This edition no longer exists." };

  const claimed = await claim(supabase, input.editionId, input.expectedVersion);
  if ("error" in claimed) return claimed.error;

  const { error } = await supabase
    .from("weekly_edition")
    .update(update as never)
    .eq("id", input.editionId);
  if (error) return dbError(error, "updateWeeklyEditionCore");

  const keys = Object.keys(update);
  await audit(supabase, ctx, requestMeta, {
    action: "weekly.edition.update",
    targetType: "weekly_edition",
    targetId: input.editionId,
    summary: `Abonten Weekly edition copy changed: ${keys.join(", ")}`,
    before: Object.fromEntries(
      keys.map((k) => [k, (before as Record<string, unknown>)[k] ?? null]),
    ),
    after: update,
  });
  return { status: 200, message: "Saved.", data: claimed };
}

export async function transitionWeeklyEditionCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: WeeklyTransitionInput,
  requestMeta?: RequestMeta,
): Promise<
  AdminEnvelope<{
    version: number;
    status: WeeklyEditionStatus;
    validation: WeeklyValidation | null;
  }>
> {
  const needsPublish = [
    "schedule",
    "unschedule",
    "publish",
    "unpublish",
  ].includes(input.action);
  try {
    assertPermission(ctx, needsPublish ? "weekly.publish" : "weekly.edit");
  } catch (e) {
    return denied(e);
  }

  const { data, error } = await supabase.rpc("weekly_edition_transition", {
    p_actor: ctx.userId,
    p_actor_roles: ctx.roles,
    p_edition_id: input.editionId,
    p_action: input.action,
    p_expected_version: input.expectedVersion,
    p_scheduled_for: (input.scheduledFor ?? null) as string,
    p_reason: (input.reason?.trim() || null) as string,
    p_request_meta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  if (error) return dbError(error, "weekly_edition_transition");

  const result = (data ?? {}) as {
    ok?: boolean;
    version?: number;
    status?: WeeklyEditionStatus;
    validation?: unknown;
  };
  const validation = result.validation
    ? mapWeeklyValidation(result.validation as never)
    : null;
  if (!result.ok) {
    return {
      status: 422,
      message:
        "This edition is not ready yet. Fix the problems listed and try again.",
      data: {
        version: result.version ?? input.expectedVersion,
        status: result.status ?? "draft",
        validation,
      },
    };
  }

  const messages: Record<WeeklyTransitionInput["action"], string> = {
    schedule: "Edition scheduled.",
    unschedule: "Schedule cancelled. The edition is a draft again.",
    publish: "Edition published.",
    unpublish: "Edition unpublished. It is a draft again.",
    archive: "Edition archived.",
    restore: "Edition restored as a draft.",
  };
  return {
    status: 200,
    message: messages[input.action],
    data: {
      version: result.version ?? input.expectedVersion + 1,
      status: result.status ?? "draft",
      validation,
    },
  };
}

// ── Sections ─────────────────────────────────────────────────────────

async function sectionOf(
  supabase: ServiceRoleClient,
  editionId: string,
  sectionId: string,
) {
  const { data } = await supabase
    .from("weekly_section")
    .select(
      "id, edition_id, kind, subject_scope, layout, title, subtitle, icon_key, body, is_visible, position",
    )
    .eq("id", sectionId)
    .maybeSingle();
  return data && data.edition_id === editionId ? data : null;
}

function sectionColumns(
  patch: Partial<{
    kind: string;
    layout: string;
    subjectScope: string;
    title: string;
    subtitle: string | null;
    iconKey: string | null;
    body: string | null;
    isVisible: boolean;
  }>,
): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};
  if (patch.kind !== undefined) out.kind = patch.kind;
  if (patch.layout !== undefined) out.layout = patch.layout;
  if (patch.subjectScope !== undefined) out.subject_scope = patch.subjectScope;
  if (patch.title !== undefined) {
    const title = sanitizeWeeklyLine(patch.title);
    if (!title) return { error: "Give the section a title." };
    out.title = title;
  }
  if (patch.subtitle !== undefined) {
    out.subtitle = sanitizeWeeklyOptional(patch.subtitle);
  }
  if (patch.iconKey !== undefined) out.icon_key = patch.iconKey ?? null;
  if (patch.body !== undefined)
    out.body = sanitizeWeeklyOptional(patch.body, true);
  if (patch.isVisible !== undefined) out.is_visible = patch.isVisible;
  return out;
}

export async function addWeeklySectionCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: AddWeeklySectionInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<Versioned & { sectionId: string }>> {
  try {
    assertPermission(ctx, "weekly.edit");
  } catch (e) {
    return denied(e);
  }
  const def = weeklySectionKind(input.section.kind);
  if (!def) return { status: 400, message: "Unknown section type." };

  const columns = sectionColumns({
    layout: def.defaultLayout,
    subjectScope: def.subjectScope,
    title: def.defaultTitle,
    subtitle: def.defaultSubtitle,
    iconKey: def.defaultIconKey,
    ...input.section,
  });
  if ("error" in columns)
    return { status: 400, message: columns.error as string };

  const { data: last } = await supabase
    .from("weekly_section")
    .select("position")
    .eq("edition_id", input.editionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((last?.position ?? -1) >= 39) {
    return { status: 400, message: "An edition can have at most 40 sections." };
  }

  const claimed = await claim(supabase, input.editionId, input.expectedVersion);
  if ("error" in claimed) return claimed.error;

  const { data, error } = await supabase
    .from("weekly_section")
    .insert({
      ...(columns as Record<string, unknown>),
      edition_id: input.editionId,
      position: (last?.position ?? -1) + 1,
      kind: def.kind,
    } as never)
    .select("id, title")
    .single();
  if (error || !data) return dbError(error, "addWeeklySectionCore");

  await audit(supabase, ctx, requestMeta, {
    action: "weekly.section.create",
    targetType: "weekly_edition",
    targetId: input.editionId,
    summary: `Section added: ${data.title}`,
    after: { sectionId: data.id, kind: def.kind, title: data.title },
  });
  return {
    status: 200,
    message: "Section added.",
    data: { version: claimed.version, sectionId: data.id },
  };
}

export async function updateWeeklySectionCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: UpdateWeeklySectionInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<Versioned>> {
  try {
    assertPermission(ctx, "weekly.edit");
  } catch (e) {
    return denied(e);
  }
  const before = await sectionOf(supabase, input.editionId, input.sectionId);
  if (!before)
    return { status: 404, message: "That section no longer exists." };
  if (input.patch.kind && !weeklySectionKind(input.patch.kind)) {
    return { status: 400, message: "Unknown section type." };
  }

  const columns = sectionColumns(input.patch);
  if ("error" in columns)
    return { status: 400, message: columns.error as string };
  if (Object.keys(columns).length === 0) {
    return { status: 400, message: "Nothing changed." };
  }

  // Narrowing a section to events or places must not strand listings of the
  // other type in it.
  if (columns.subject_scope && columns.subject_scope !== "mixed") {
    const other = columns.subject_scope === "events" ? "place" : "event";
    const { count } = await supabase
      .from("weekly_item")
      .select("id", { count: "exact", head: true })
      .eq("section_id", input.sectionId)
      .eq("subject_type", other);
    if ((count ?? 0) > 0) {
      return {
        status: 400,
        message: `Remove the ${other === "place" ? "places" : "events"} from this section first.`,
      };
    }
  }

  const claimed = await claim(supabase, input.editionId, input.expectedVersion);
  if ("error" in claimed) return claimed.error;

  const { error } = await supabase
    .from("weekly_section")
    .update(columns as never)
    .eq("id", input.sectionId);
  if (error) return dbError(error, "updateWeeklySectionCore");

  const keys = Object.keys(columns);
  await audit(supabase, ctx, requestMeta, {
    action: "weekly.section.update",
    targetType: "weekly_edition",
    targetId: input.editionId,
    summary: `Section "${before.title}" changed: ${keys.join(", ")}`,
    before: Object.fromEntries(
      keys.map((k) => [k, (before as Record<string, unknown>)[k] ?? null]),
    ),
    after: { sectionId: input.sectionId, ...columns },
  });
  return { status: 200, message: "Section saved.", data: claimed };
}

export async function deleteWeeklySectionCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { editionId: string; expectedVersion: number; sectionId: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<Versioned>> {
  try {
    assertPermission(ctx, "weekly.edit");
  } catch (e) {
    return denied(e);
  }
  const before = await sectionOf(supabase, input.editionId, input.sectionId);
  if (!before)
    return { status: 404, message: "That section no longer exists." };

  const claimed = await claim(supabase, input.editionId, input.expectedVersion);
  if ("error" in claimed) return claimed.error;

  const { error } = await supabase
    .from("weekly_section")
    .delete()
    .eq("id", input.sectionId);
  if (error) return dbError(error, "deleteWeeklySectionCore");

  const { data: rest } = await supabase
    .from("weekly_section")
    .select("id")
    .eq("edition_id", input.editionId)
    .order("position");
  if (rest && rest.length > 0) {
    const { error: reorderError } = await supabase.rpc(
      "weekly_sections_reorder",
      { p_edition_id: input.editionId, p_section_ids: rest.map((r) => r.id) },
    );
    if (reorderError) {
      logger.error(`weekly section renumber failed: ${reorderError.message}`);
    }
  }

  await audit(supabase, ctx, requestMeta, {
    action: "weekly.section.delete",
    targetType: "weekly_edition",
    targetId: input.editionId,
    summary: `Section removed: ${before.title}`,
    before: {
      sectionId: input.sectionId,
      kind: before.kind,
      title: before.title,
    },
  });
  return { status: 200, message: "Section removed.", data: claimed };
}

export async function reorderWeeklySectionsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { editionId: string; expectedVersion: number; sectionIds: string[] },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<Versioned>> {
  try {
    assertPermission(ctx, "weekly.edit");
  } catch (e) {
    return denied(e);
  }
  const { data: current } = await supabase
    .from("weekly_section")
    .select("id")
    .eq("edition_id", input.editionId);
  if (
    !sameSet(
      (current ?? []).map((r) => r.id),
      input.sectionIds,
    )
  ) {
    return DB_ERRORS.weekly_reorder_mismatch as AdminEnvelope<Versioned>;
  }

  const claimed = await claim(supabase, input.editionId, input.expectedVersion);
  if ("error" in claimed) return claimed.error;

  const { error } = await supabase.rpc("weekly_sections_reorder", {
    p_edition_id: input.editionId,
    p_section_ids: input.sectionIds,
  });
  if (error) return dbError(error, "weekly_sections_reorder");

  await audit(supabase, ctx, requestMeta, {
    action: "weekly.section.reorder",
    targetType: "weekly_edition",
    targetId: input.editionId,
    summary: "Sections reordered",
    after: { sectionIds: input.sectionIds },
  });
  return { status: 200, message: "Order saved.", data: claimed };
}

// ── Items ────────────────────────────────────────────────────────────

export async function addWeeklyItemCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: AddWeeklyItemInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<Versioned & { itemId: string }>> {
  try {
    assertPermission(ctx, "weekly.edit");
  } catch (e) {
    return denied(e);
  }
  const section = await sectionOf(supabase, input.editionId, input.sectionId);
  if (!section)
    return { status: 404, message: "That section no longer exists." };
  if (section.kind === "editorial") {
    return { status: 400, message: "Editorial notes cannot hold listings." };
  }
  if (
    !sectionAccepts(
      section.subject_scope as WeeklySubjectScope,
      input.subjectType,
    )
  ) {
    return {
      status: 400,
      message:
        section.subject_scope === "events"
          ? "This section only takes events."
          : "This section only takes places.",
    };
  }

  const [{ data: validity, error: validityError }, settings, existing] =
    await Promise.all([
      supabase.rpc("weekly_subject_validity", {
        p_subject_type: input.subjectType,
        p_subject_id: input.subjectId,
      }),
      readWeeklySettings(supabase),
      supabase
        .from("weekly_item")
        .select("position, subject_type, subject_id")
        .eq("section_id", input.sectionId)
        .order("position", { ascending: false }),
    ]);
  if (validityError) return dbError(validityError, "weekly_subject_validity");
  if (validity) {
    return {
      status: 400,
      message: `This listing cannot be featured: ${WEEKLY_VALIDITY_LABEL[validity as WeeklyValidityReason] ?? validity}.`,
    };
  }
  const rows = existing.data ?? [];
  if (
    rows.some(
      (r) =>
        r.subject_type === input.subjectType &&
        r.subject_id === input.subjectId,
    )
  ) {
    return { status: 409, message: "That listing is already in the section." };
  }
  const max = settings?.max_items_per_section ?? 12;
  if (rows.length >= max) {
    return {
      status: 400,
      message: `A section can hold at most ${max} listings. Change the limit in Settings or remove one first.`,
    };
  }

  const claimed = await claim(supabase, input.editionId, input.expectedVersion);
  if ("error" in claimed) return claimed.error;

  const { data, error } = await supabase
    .from("weekly_item")
    .insert({
      section_id: input.sectionId,
      edition_id: input.editionId,
      position: (rows[0]?.position ?? -1) + 1,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      source: "manual",
      headline: sanitizeWeeklyOptional(input.headline),
      blurb: sanitizeWeeklyOptional(input.blurb, true),
      added_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !data) return dbError(error, "addWeeklyItemCore");

  await audit(supabase, ctx, requestMeta, {
    action: "weekly.item.add",
    targetType: "weekly_edition",
    targetId: input.editionId,
    summary: `Listing added to "${section.title}"`,
    after: {
      itemId: data.id,
      sectionId: input.sectionId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    },
  });
  return {
    status: 200,
    message: "Listing added.",
    data: { version: claimed.version, itemId: data.id },
  };
}

async function itemOf(
  supabase: ServiceRoleClient,
  editionId: string,
  itemId: string,
) {
  const { data } = await supabase
    .from("weekly_item")
    .select(
      "id, edition_id, section_id, subject_type, subject_id, headline, blurb, pinned",
    )
    .eq("id", itemId)
    .maybeSingle();
  return data && data.edition_id === editionId ? data : null;
}

export async function updateWeeklyItemCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: UpdateWeeklyItemInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<Versioned>> {
  try {
    assertPermission(ctx, "weekly.edit");
  } catch (e) {
    return denied(e);
  }
  const before = await itemOf(supabase, input.editionId, input.itemId);
  if (!before)
    return {
      status: 404,
      message: "That listing is no longer in this edition.",
    };

  const update: Record<string, unknown> = {};
  if (input.patch.headline !== undefined) {
    update.headline = sanitizeWeeklyOptional(input.patch.headline);
  }
  if (input.patch.blurb !== undefined) {
    update.blurb = sanitizeWeeklyOptional(input.patch.blurb, true);
  }
  if (input.patch.pinned !== undefined) update.pinned = input.patch.pinned;

  let target: Awaited<ReturnType<typeof sectionOf>> = null;
  if (input.moveToSectionId && input.moveToSectionId !== before.section_id) {
    target = await sectionOf(supabase, input.editionId, input.moveToSectionId);
    if (!target)
      return { status: 404, message: "That section no longer exists." };
    if (target.kind === "editorial") {
      return { status: 400, message: "Editorial notes cannot hold listings." };
    }
    if (
      !sectionAccepts(
        target.subject_scope as WeeklySubjectScope,
        before.subject_type as "event" | "place",
      )
    ) {
      return {
        status: 400,
        message: "That section does not take this kind of listing.",
      };
    }
  }
  if (Object.keys(update).length === 0 && !target) {
    return { status: 400, message: "Nothing changed." };
  }

  const claimed = await claim(supabase, input.editionId, input.expectedVersion);
  if ("error" in claimed) return claimed.error;

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from("weekly_item")
      .update(update as never)
      .eq("id", input.itemId);
    if (error) return dbError(error, "updateWeeklyItemCore");
  }
  if (target) {
    const { error } = await supabase.rpc("weekly_item_move", {
      p_item_id: input.itemId,
      p_to_section_id: target.id,
    });
    if (error) return dbError(error, "weekly_item_move");
  }

  await audit(supabase, ctx, requestMeta, {
    action: target ? "weekly.item.move" : "weekly.item.update",
    targetType: "weekly_edition",
    targetId: input.editionId,
    summary: target
      ? `Listing moved to "${target.title}"`
      : "Listing details changed",
    before: {
      itemId: before.id,
      sectionId: before.section_id,
      headline: before.headline,
      blurb: before.blurb,
      pinned: before.pinned,
    },
    after: { ...update, ...(target ? { sectionId: target.id } : {}) },
  });
  return { status: 200, message: "Saved.", data: claimed };
}

export async function removeWeeklyItemCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { editionId: string; expectedVersion: number; itemId: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<Versioned>> {
  try {
    assertPermission(ctx, "weekly.edit");
  } catch (e) {
    return denied(e);
  }
  const before = await itemOf(supabase, input.editionId, input.itemId);
  if (!before)
    return {
      status: 404,
      message: "That listing is no longer in this edition.",
    };

  const claimed = await claim(supabase, input.editionId, input.expectedVersion);
  if ("error" in claimed) return claimed.error;

  const { error } = await supabase
    .from("weekly_item")
    .delete()
    .eq("id", input.itemId);
  if (error) return dbError(error, "removeWeeklyItemCore");

  const { data: rest } = await supabase
    .from("weekly_item")
    .select("id")
    .eq("section_id", before.section_id)
    .order("position");
  if (rest && rest.length > 0) {
    const { error: reorderError } = await supabase.rpc("weekly_items_reorder", {
      p_section_id: before.section_id,
      p_item_ids: rest.map((r) => r.id),
    });
    if (reorderError) {
      logger.error(`weekly item renumber failed: ${reorderError.message}`);
    }
  }

  await audit(supabase, ctx, requestMeta, {
    action: "weekly.item.remove",
    targetType: "weekly_edition",
    targetId: input.editionId,
    summary: "Listing removed",
    before: {
      itemId: before.id,
      sectionId: before.section_id,
      subjectType: before.subject_type,
      subjectId: before.subject_id,
    },
  });
  return { status: 200, message: "Listing removed.", data: claimed };
}

export async function reorderWeeklyItemsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    editionId: string;
    expectedVersion: number;
    sectionId: string;
    itemIds: string[];
  },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<Versioned>> {
  try {
    assertPermission(ctx, "weekly.edit");
  } catch (e) {
    return denied(e);
  }
  const section = await sectionOf(supabase, input.editionId, input.sectionId);
  if (!section)
    return { status: 404, message: "That section no longer exists." };
  const { data: current } = await supabase
    .from("weekly_item")
    .select("id")
    .eq("section_id", input.sectionId);
  if (
    !sameSet(
      (current ?? []).map((r) => r.id),
      input.itemIds,
    )
  ) {
    return DB_ERRORS.weekly_reorder_mismatch as AdminEnvelope<Versioned>;
  }

  const claimed = await claim(supabase, input.editionId, input.expectedVersion);
  if ("error" in claimed) return claimed.error;

  const { error } = await supabase.rpc("weekly_items_reorder", {
    p_section_id: input.sectionId,
    p_item_ids: input.itemIds,
  });
  if (error) return dbError(error, "weekly_items_reorder");

  await audit(supabase, ctx, requestMeta, {
    action: "weekly.item.reorder",
    targetType: "weekly_edition",
    targetId: input.editionId,
    summary: `Listings reordered in "${section.title}"`,
    after: { sectionId: input.sectionId, itemIds: input.itemIds },
  });
  return { status: 200, message: "Order saved.", data: claimed };
}

// ── Picker and preview ──────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Listings an editor can add. Accepts a search phrase, a pasted event code or
 * listing id, or a pasted /events/<code> or /places/<slug> link.
 */
export async function searchWeeklySubjectsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { q: string; subjectType?: "event" | "place" | "any" },
): Promise<AdminEnvelope<WeeklySubjectOption[]>> {
  try {
    assertPermission(ctx, "weekly.edit");
  } catch (e) {
    return denied(e);
  }
  const q = input.q.trim();
  const wantEvents = input.subjectType !== "place";
  const wantPlaces = input.subjectType !== "event";

  const options: WeeklySubjectOption[] = [];
  const linkMatch = q.match(/\/(events|places)\/([^/?#\s]+)/i);
  const direct = UUID.test(q)
    ? { kind: "id" as const, value: q }
    : linkMatch
      ? {
          kind:
            linkMatch[1].toLowerCase() === "events"
              ? ("code" as const)
              : ("slug" as const),
          value: decodeURIComponent(linkMatch[2]),
        }
      : /^[A-Za-z0-9]{6,12}$/.test(q)
        ? { kind: "code" as const, value: q }
        : null;

  if (direct) {
    if (wantEvents && direct.kind !== "slug") {
      const query = supabase
        .from("event")
        .select(
          "id, title, event_code, starts_at, flyer_public_id, flyer_version, address",
        );
      const { data } =
        direct.kind === "id"
          ? await query.eq("id", direct.value).limit(1)
          : await query.ilike("event_code", direct.value).limit(1);
      for (const e of data ?? []) {
        options.push({
          subjectType: "event",
          subjectId: e.id,
          label: e.title,
          sublabel:
            (e.address as { full_address?: string } | null)?.full_address ??
            null,
          imagePublicId: e.flyer_public_id,
          imageVersion: e.flyer_version,
          startsAt: e.starts_at,
          validity: null,
        });
      }
    }
    if (wantPlaces && direct.kind !== "code") {
      const query = supabase
        .from("place")
        .select("id, name, slug, cover_public_id, cover_version, address");
      const { data } =
        direct.kind === "id"
          ? await query.eq("id", direct.value).limit(1)
          : await query.eq("slug", direct.value).limit(1);
      for (const p of data ?? []) {
        options.push({
          subjectType: "place",
          subjectId: p.id,
          label: p.name,
          sublabel:
            (p.address as { full_address?: string } | null)?.full_address ??
            null,
          imagePublicId: p.cover_public_id,
          imageVersion: p.cover_version,
          startsAt: null,
          validity: null,
        });
      }
    }
  }

  if (options.length === 0) {
    const types = [
      wantEvents ? "event" : null,
      wantPlaces ? "place" : null,
    ].filter((t): t is string => t !== null);
    const { data, error } = await supabase.rpc("search_suggest", {
      p_query: q,
      p_types: types,
    });
    if (error) return dbError(error, "search_suggest");
    for (const row of data ?? []) {
      if (row.entity_type !== "event" && row.entity_type !== "place") continue;
      options.push({
        subjectType: row.entity_type,
        subjectId: row.id,
        label: row.label,
        sublabel: row.sublabel,
        imagePublicId: row.image_public_id,
        imageVersion: row.image_version,
        startsAt: row.starts_at,
        validity: null,
      });
    }
  }

  const checked = await Promise.all(
    options.slice(0, 12).map(async (option) => {
      const { data } = await supabase.rpc("weekly_subject_validity", {
        p_subject_type: option.subjectType,
        p_subject_id: option.subjectId,
      });
      return {
        ...option,
        validity: (data ?? null) as WeeklyValidityReason | null,
      };
    }),
  );
  return { status: 200, data: checked };
}

export async function getWeeklyPreviewLinkCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { editionId: string },
): Promise<AdminEnvelope<{ url: string; expiresAt: string }>> {
  try {
    assertPermission(ctx, "weekly.view");
  } catch (e) {
    return denied(e);
  }
  const { data } = await supabase
    .from("weekly_edition")
    .select("id")
    .eq("id", input.editionId)
    .maybeSingle();
  if (!data) return { status: 404, message: "This edition no longer exists." };

  const now = Date.now();
  const token = createWeeklyPreviewToken(input.editionId, now);
  const base = (process.env.WEB_BASE_URL || PUBLIC_SITE_ORIGIN).replace(
    /\/+$/,
    "",
  );
  return {
    status: 200,
    data: {
      url: `${base}/weekly/preview/${token}`,
      expiresAt: new Date(Number(token.split(".")[1])).toISOString(),
    },
  };
}
