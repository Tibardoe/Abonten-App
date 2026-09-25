import { logger } from "@abonten/core/logger";
import { WEEKLY_NATIONAL_SCOPE_SLUG } from "@abonten/core/weekly/copy";
import { sanitizeWeeklyLine } from "@abonten/core/weekly/editorialText";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { WeeklyScope, WeeklySettings } from "@abonten/types/weeklyType";
import type {
  WeeklyScopeInput,
  WeeklySettingsInput,
} from "@abonten/validation/weeklySchemas";
import { resolveLocation } from "../../geo/locationResolution";
import {
  isWeeklyKillSwitchOn,
  mapWeeklySettings,
  readWeeklySettings,
  resetWeeklySettingsCache,
} from "../../weekly/weeklyProgram";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin > Weekly > Settings and Areas. Reads need weekly.view; changes need
// weekly.configure plus step-up (checked by the admin transport), a reason,
// and the row's last updated_at (optimistic concurrency). Every change is
// audited field by field.

type RequestMeta = Record<string, unknown> | undefined;

const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

// ── Settings ────────────────────────────────────────────────────────

export async function getWeeklySettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<{ settings: WeeklySettings; killSwitch: boolean }>> {
  try {
    assertPermission(ctx, "weekly.view");
  } catch (e) {
    return denied(e);
  }
  const row = await readWeeklySettings(supabase, { fresh: true });
  if (!row) return { status: 500, message: "Couldn't load the settings." };
  return {
    status: 200,
    data: {
      settings: mapWeeklySettings(row),
      killSwitch: isWeeklyKillSwitchOn(),
    },
  };
}

const COLUMN: Record<keyof WeeklySettingsInput["patch"], string> = {
  enabled: "enabled",
  audience: "audience",
  betaUserIds: "beta_user_ids",
  teaserEnabled: "teaser_enabled",
  defaultPublishHourLocal: "default_publish_hour_local",
  maxItemsPerSection: "max_items_per_section",
  maxPerOrganizerPerSection: "max_per_organizer_per_section",
  exposureLookbackEditions: "exposure_lookback_editions",
  editionRetentionWeeks: "edition_retention_weeks",
};

export async function updateWeeklySettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: WeeklySettingsInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<WeeklySettings>> {
  try {
    assertPermission(ctx, "weekly.configure");
  } catch (e) {
    return denied(e);
  }
  const beforeRow = await readWeeklySettings(supabase, { fresh: true });
  if (!beforeRow)
    return { status: 500, message: "Couldn't load the settings." };
  const before = mapWeeklySettings(beforeRow);

  const update: Record<string, unknown> = {};
  const changed: (keyof WeeklySettings)[] = [];
  for (const [key, value] of Object.entries(input.patch)) {
    const column = COLUMN[key as keyof typeof COLUMN];
    if (!column || value === undefined) continue;
    if (
      JSON.stringify(before[key as keyof WeeklySettings]) ===
      JSON.stringify(value)
    ) {
      continue;
    }
    update[column] = value;
    changed.push(key as keyof WeeklySettings);
  }
  if (changed.length === 0) return { status: 400, message: "Nothing changed." };

  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("weekly_program_setting")
    .update(update as never)
    .eq("id", 1)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) {
    logger.error(`updateWeeklySettingsCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't save the settings." };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed these settings. Reload and try again.",
    };
  }
  resetWeeklySettingsCache();

  const after = mapWeeklySettings(data);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "weekly.settings.update",
    targetType: "weekly_program_setting",
    targetId: "1",
    summary: `Abonten Weekly settings changed: ${changed.join(", ")}`,
    reason: input.reason,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Settings saved.", data: after };
}

// ── Areas (scopes) ──────────────────────────────────────────────────

type ScopeRow = {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  centre_lat: number | null;
  centre_lng: number | null;
  radius_km: number | null;
  status: string;
  position: number;
  updated_at: string;
};

const SCOPE_COLUMNS =
  "id, slug, name, country_code, centre_lat, centre_lng, radius_km, status, position, updated_at";

function mapScope(row: ScopeRow, editionCount: number): WeeklyScope {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    countryCode: row.country_code,
    isNational: row.centre_lat === null,
    centreLat: row.centre_lat,
    centreLng: row.centre_lng,
    radiusKm: row.radius_km === null ? null : Number(row.radius_km),
    status: row.status as WeeklyScope["status"],
    position: row.position,
    editionCount,
    updatedAt: row.updated_at,
  };
}

export async function listWeeklyScopesCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<WeeklyScope[]>> {
  try {
    assertPermission(ctx, "weekly.view");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase
    .from("weekly_scope")
    .select(`${SCOPE_COLUMNS}, weekly_edition(count)`)
    .order("position")
    .order("name");
  if (error) {
    logger.error(`listWeeklyScopesCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't load the areas." };
  }
  return {
    status: 200,
    data: (data ?? []).map((row) => {
      const counted = row.weekly_edition as unknown as
        | { count: number }[]
        | null;
      return mapScope(row as unknown as ScopeRow, counted?.[0]?.count ?? 0);
    }),
  };
}

export async function upsertWeeklyScopeCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: WeeklyScopeInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<WeeklyScope>> {
  try {
    assertPermission(ctx, "weekly.configure");
  } catch (e) {
    return denied(e);
  }
  const s = input.scope;
  const row: Record<string, unknown> = {};
  if (s.name !== undefined) {
    const name = sanitizeWeeklyLine(s.name);
    if (name.length < 2) return { status: 400, message: "Name the area." };
    row.name = name;
  }
  if (s.slug !== undefined) row.slug = s.slug;
  if (s.radiusKm !== undefined) row.radius_km = s.radiusKm;
  if (s.status !== undefined) row.status = s.status;
  if (s.position !== undefined) row.position = s.position;
  const hasCentre = s.centreLat !== undefined && s.centreLng !== undefined;
  if ((s.centreLat === undefined) !== (s.centreLng === undefined)) {
    return { status: 400, message: "Give both latitude and longitude." };
  }
  if (hasCentre) {
    row.centre = `SRID=4326;POINT(${s.centreLng} ${s.centreLat})`;
    // The area belongs to the market its centre is in (its editions use
    // that market's calendar and fall back to its country-wide picks).
    const where = await resolveLocation({
      lat: s.centreLat as number,
      lng: s.centreLng as number,
    });
    if (!where.market) {
      return {
        status: 400,
        message: "That point isn't in a country Abonten has a market for.",
      };
    }
    row.country_code = where.countryCode;
  }

  if (!input.scopeId) {
    if (!row.name || !row.slug || !hasCentre || row.radius_km === undefined) {
      return {
        status: 400,
        message: "A new area needs a name, an address, a centre and a radius.",
      };
    }
    if (row.slug === WEEKLY_NATIONAL_SCOPE_SLUG) {
      return { status: 409, message: "That address is already in use." };
    }
    const { data, error } = await supabase
      .from("weekly_scope")
      .insert({ ...row, created_by: ctx.userId } as never)
      .select(SCOPE_COLUMNS)
      .single();
    if (error || !data) {
      if (error?.code === "23505") {
        return { status: 409, message: "That address is already in use." };
      }
      logger.error(`upsertWeeklyScopeCore insert failed: ${error?.message}`);
      return { status: 500, message: "Couldn't save the area." };
    }
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "weekly.scope.create",
      targetType: "weekly_scope",
      targetId: data.id,
      summary: `Abonten Weekly area created: ${data.name}`,
      reason: input.reason,
      after: { ...row },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    return {
      status: 200,
      message: "Area created.",
      data: mapScope(data as ScopeRow, 0),
    };
  }

  const { data: before } = await supabase
    .from("weekly_scope")
    .select(SCOPE_COLUMNS)
    .eq("id", input.scopeId)
    .maybeSingle();
  if (!before) return { status: 404, message: "That area no longer exists." };
  if (before.centre_lat === null) {
    // The national area has no centre or radius and cannot be retired or renamed at its address.
    if (
      hasCentre ||
      row.radius_km !== undefined ||
      row.status === "retired" ||
      row.slug !== undefined
    ) {
      return {
        status: 400,
        message:
          "The national area covers the whole country. Only its name and order can change.",
      };
    }
  }
  if (Object.keys(row).length === 0)
    return { status: 400, message: "Nothing changed." };
  if (!input.expectedUpdatedAt) {
    return { status: 400, message: "Reload the page and try again." };
  }

  const { data, error } = await supabase
    .from("weekly_scope")
    .update(row as never)
    .eq("id", input.scopeId)
    .eq("updated_at", input.expectedUpdatedAt)
    .select(SCOPE_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return { status: 409, message: "That address is already in use." };
    }
    logger.error(`upsertWeeklyScopeCore update failed: ${error.message}`);
    return { status: 500, message: "Couldn't save the area." };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed this area. Reload and try again.",
    };
  }

  const { count } = await supabase
    .from("weekly_edition")
    .select("id", { count: "exact", head: true })
    .eq("scope_id", input.scopeId);

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action:
      row.status === "retired" ? "weekly.scope.retire" : "weekly.scope.update",
    targetType: "weekly_scope",
    targetId: input.scopeId,
    summary: `Abonten Weekly area changed: ${data.name}`,
    reason: input.reason,
    before: before as unknown as Record<string, unknown>,
    after: row,
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message: "Area saved.",
    data: mapScope(data as ScopeRow, count ?? 0),
  };
}
