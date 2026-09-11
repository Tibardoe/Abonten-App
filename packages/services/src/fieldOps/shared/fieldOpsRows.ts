import { logger } from "@abonten/core/logger";
import { maskPhoneNumber } from "@abonten/core/normalizePhoneNumber";
import type {
  FieldOpsAssignment,
  FieldOpsAssignmentMode,
  FieldOpsAssignmentStatus,
  FieldOpsCampaignStatus,
  FieldOpsCampaignSummary,
  FieldOpsContactAttempt,
  FieldOpsMemberRole,
  FieldOpsProspect,
  FieldOpsTerritory,
  FieldOpsTerritoryKind,
  GeoJsonPolygon,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { createNotificationCore } from "../../notifications/createNotification";

// Row shapes, mappers and small helpers shared by the member, lead and admin
// Field Ops services. Nothing here checks authorization: every core resolves
// the caller's context first and only then reads/writes on the service role.

export type FieldOpsEnvelope<T> = {
  status: number;
  message?: string;
  data?: T;
};

export const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function dbErr(
  error: { message: string; code?: string },
  friendly: string,
): { status: number; message: string } {
  logger.error(`${friendly}: ${error.message}`);
  const status =
    error.code === "23505"
      ? 409
      : error.code === "23514" || error.code === "22P02"
        ? 400
        : error.code === "P0002"
          ? 404
          : 400;
  return { status, message: `${friendly}: ${error.message}` };
}

/** Today as YYYY-MM-DD in UTC (the campaign's local day for GMT regions). */
export const todayIso = (now: Date = new Date()): string =>
  now.toISOString().slice(0, 10);

/** `POINT(lng lat)` WKT for a geography column write. */
export const pointWkt = (p: { lat: number; lng: number }) =>
  `SRID=4326;POINT(${p.lng} ${p.lat})`;

/** WKT polygon for a geography write, from a GeoJSON polygon. */
export function polygonWkt(polygon: GeoJsonPolygon): string {
  const rings = polygon.coordinates
    .map((ring) => `(${ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ")})`)
    .join(", ");
  return `SRID=4326;POLYGON(${rings})`;
}

// ── People ──────────────────────────────────────────────────

export type UserName = { username: string | null; fullName: string | null };

export async function namesFor(
  supabase: ServiceRoleClient,
  ids: (string | null | undefined)[],
): Promise<Map<string, UserName>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const map = new Map<string, UserName>();
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from("user_info")
    .select("id, username, full_name")
    .in("id", unique);
  for (const row of data ?? []) {
    map.set(row.id, { username: row.username, fullName: row.full_name });
  }
  return map;
}

export const displayName = (n: UserName | undefined): string | null =>
  n?.fullName || n?.username || null;

// ── Territories ─────────────────────────────────────────────

export type TerritoryRow = {
  id: string;
  region_id: string;
  parent_territory_id: string | null;
  name: string;
  kind: string;
  centre_lat: number | null;
  centre_lng: number | null;
  radius_m: number;
  boundary_geojson: unknown;
  status: string;
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const TERRITORY_COLUMNS =
  "id, region_id, parent_territory_id, name, kind, centre_lat, centre_lng, radius_m, boundary_geojson, status, priority, notes, created_at, updated_at";

export function mapTerritory(row: TerritoryRow): FieldOpsTerritory {
  const boundary = row.boundary_geojson as GeoJsonPolygon | null;
  return {
    id: row.id,
    regionId: row.region_id,
    parentTerritoryId: row.parent_territory_id,
    name: row.name,
    kind: row.kind as FieldOpsTerritory["kind"],
    centre: { lat: row.centre_lat ?? 0, lng: row.centre_lng ?? 0 },
    radiusM: num(row.radius_m),
    boundary:
      boundary && boundary.type === "Polygon"
        ? { type: "Polygon", coordinates: boundary.coordinates }
        : null,
    status: row.status as FieldOpsTerritory["status"],
    priority: num(row.priority),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Campaign summary (what a member may know) ───────────────

export async function campaignSummary(
  supabase: ServiceRoleClient,
  campaignId: string,
): Promise<FieldOpsCampaignSummary | null> {
  const { data, error } = await supabase
    .from("fieldops_campaign")
    .select(
      "id, name, status, currency, region_id, starts_on, ends_on, fieldops_region(name)",
    )
    .eq("id", campaignId)
    .maybeSingle();
  if (error || !data) {
    if (error) logger.error(`fieldOps campaignSummary: ${error.message}`);
    return null;
  }
  const region = data.fieldops_region as unknown as { name: string } | null;
  return {
    id: data.id,
    name: data.name,
    status: data.status as FieldOpsCampaignStatus,
    currency: data.currency,
    regionId: data.region_id,
    regionName: region?.name ?? "",
    startsOn: data.starts_on,
    endsOn: data.ends_on,
  };
}

// ── Assignments ─────────────────────────────────────────────

export type AssignmentRow = {
  id: string;
  campaign_id: string;
  team_id: string;
  member_id: string;
  member_user_id: string;
  territory_id: string;
  mode: string;
  starts_on: string;
  ends_on: string;
  status: string;
  started_at: string | null;
  start_lat: number | null;
  start_lng: number | null;
  start_accuracy_m: number | null;
  start_distance_m: number | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  assigned_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  fieldops_territory?: { name: string; kind: string } | null;
  fieldops_team_member?: {
    role: string;
    full_name_snapshot: string | null;
  } | null;
};

export const ASSIGNMENT_COLUMNS =
  "id, campaign_id, team_id, member_id, member_user_id, territory_id, mode, starts_on, ends_on, status, started_at, start_lat, start_lng, start_accuracy_m, start_distance_m, completed_at, cancelled_at, cancel_reason, assigned_by, notes, created_at, updated_at, fieldops_territory(name, kind), fieldops_team_member(role, full_name_snapshot)";

export async function mapAssignments(
  supabase: ServiceRoleClient,
  rows: AssignmentRow[],
): Promise<FieldOpsAssignment[]> {
  const names = await namesFor(
    supabase,
    rows
      .filter((r) => !r.fieldops_team_member?.full_name_snapshot)
      .map((r) => r.member_user_id),
  );
  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    teamId: r.team_id,
    memberId: r.member_id,
    memberUserId: r.member_user_id,
    memberName:
      r.fieldops_team_member?.full_name_snapshot ??
      displayName(names.get(r.member_user_id)),
    memberRole: (r.fieldops_team_member?.role ??
      (r.mode === "offline"
        ? "offline_member"
        : "online_member")) as FieldOpsMemberRole,
    territoryId: r.territory_id,
    territoryName: r.fieldops_territory?.name ?? "",
    territoryKind: (r.fieldops_territory?.kind ??
      "town") as FieldOpsTerritoryKind,
    mode: r.mode as FieldOpsAssignmentMode,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    status: r.status as FieldOpsAssignmentStatus,
    startedAt: r.started_at,
    startLocation:
      r.start_lat !== null && r.start_lng !== null
        ? { lat: r.start_lat, lng: r.start_lng }
        : null,
    startAccuracyM: r.start_accuracy_m,
    startDistanceM: r.start_distance_m,
    completedAt: r.completed_at,
    cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason,
    assignedBy: r.assigned_by,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// ── Prospects ───────────────────────────────────────────────

export type ProspectRow = {
  id: string;
  campaign_id: string;
  team_id: string;
  territory_id: string;
  member_id: string;
  member_user_id: string;
  kind: string;
  name: string;
  contact_name: string | null;
  contact_phone_e164: string | null;
  contact_channel: string | null;
  status: string;
  contact_attempts: unknown;
  matched_place_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  fieldops_team_member?: { full_name_snapshot: string | null } | null;
};

export const PROSPECT_COLUMNS =
  "id, campaign_id, team_id, territory_id, member_id, member_user_id, kind, name, contact_name, contact_phone_e164, contact_channel, status, contact_attempts, matched_place_id, notes, created_at, updated_at, fieldops_team_member(full_name_snapshot)";

/**
 * Prospects for a viewer. The contact phone is shown in full only to the
 * member who logged it; the lead (and later admins) see it masked.
 */
export function mapProspects(
  rows: ProspectRow[],
  viewerUserId: string,
): FieldOpsProspect[] {
  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    teamId: r.team_id,
    territoryId: r.territory_id,
    memberId: r.member_id,
    memberUserId: r.member_user_id,
    memberName: r.fieldops_team_member?.full_name_snapshot ?? null,
    kind: r.kind as FieldOpsProspect["kind"],
    name: r.name,
    contactName: r.contact_name,
    contactPhoneMasked: r.contact_phone_e164
      ? r.member_user_id === viewerUserId
        ? r.contact_phone_e164
        : maskPhoneNumber(r.contact_phone_e164)
      : null,
    contactChannel: r.contact_channel as FieldOpsProspect["contactChannel"],
    status: r.status as FieldOpsProspect["status"],
    contactAttempts: Array.isArray(r.contact_attempts)
      ? (r.contact_attempts as FieldOpsContactAttempt[])
      : [],
    matchedPlaceId: r.matched_place_id,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// ── Notifications ───────────────────────────────────────────

/**
 * One in-app notification (+ push, unless the programme's push switch is
 * off) per recipient. Best-effort: never fails the action that caused it.
 */
export async function notifyFieldOps(
  supabase: ServiceRoleClient,
  userIds: string[],
  notice: {
    type: string;
    title: string;
    body?: string | null;
    /** /field route the notice opens. */
    route: string;
  },
): Promise<void> {
  const recipients = [...new Set(userIds.filter(Boolean))];
  if (recipients.length === 0) return;
  const { data: settings } = await supabase
    .from("fieldops_program_setting")
    .select("notify_push_enabled")
    .eq("id", 1)
    .maybeSingle();
  const push = settings?.notify_push_enabled !== false;
  await Promise.all(
    recipients.map(async (userId) => {
      try {
        if (push) {
          await createNotificationCore(supabase, {
            userId,
            type: notice.type,
            title: notice.title,
            body: notice.body ?? null,
            link: notice.route,
            data: { kind: "fieldops", fieldOpsRoute: notice.route },
          });
        } else {
          await supabase.from("notification").insert({
            user_id: userId,
            type: notice.type,
            title: notice.title,
            body: notice.body ?? null,
            link: notice.route,
            data: { kind: "fieldops", fieldOpsRoute: notice.route },
          });
        }
      } catch (err) {
        logger.error(`fieldOps notify ${notice.type} failed: ${err}`);
      }
    }),
  );
}
