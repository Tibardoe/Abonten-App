import { logger } from "@abonten/core/logger";
import { maskAccountNumber } from "@abonten/core/maskAccountNumber";
import { maskPhoneNumber } from "@abonten/core/normalizePhoneNumber";
import type {
  FieldOpsActivityKey,
  FieldOpsCampaign,
  FieldOpsCampaignStatus,
  FieldOpsCommissionRule,
  FieldOpsMemberRole,
  FieldOpsMemberStatus,
  FieldOpsProgramSettings,
  FieldOpsRegion,
  FieldOpsTeamMember,
  FieldOpsTerritory,
  GeoJsonPolygon,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { type AdminEnvelope, adminError } from "../adminContext";
import { displayName, namesFor } from "../rewards/rewardsAdminCore";

// Row shapes + mappers shared by the Field Ops admin cores. Every core takes
// a service-role client + a resolved AdminContext and re-checks its own
// permission (assertPermission); these helpers only translate rows to the
// DTOs in @abonten/types/fieldOps.

export type RequestMeta = Record<string, unknown> | undefined;

// An error envelope carries no data, so it fits any AdminEnvelope<T>.
export const denied = (e: unknown): AdminEnvelope<never> =>
  adminError(e) as AdminEnvelope<never>;

export const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function dbError(
  error: { message: string; code?: string },
  friendly: string,
): AdminEnvelope<never> {
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

// ── Settings ────────────────────────────────────────────────

export type SettingsRow = {
  program_enabled: boolean;
  worker_ui_enabled: boolean;
  commission_generation_enabled: boolean;
  payouts_enabled: boolean;
  require_member_phone_verified: boolean;
  default_holding_days: number;
  duplicate_radius_m: number;
  duplicate_name_similarity: number | string;
  offline_max_distance_m: number;
  daily_submission_cap: number;
  spot_check_bps: number;
  review_grace_days: number;
  evidence_retention_days: number;
  notify_push_enabled: boolean;
  updated_at: string;
  updated_by: string | null;
};

export function mapSettings(row: SettingsRow): FieldOpsProgramSettings {
  return {
    programEnabled: row.program_enabled,
    workerUiEnabled: row.worker_ui_enabled,
    commissionGenerationEnabled: row.commission_generation_enabled,
    payoutsEnabled: row.payouts_enabled,
    requireMemberPhoneVerified: row.require_member_phone_verified,
    defaultHoldingDays: num(row.default_holding_days),
    duplicateRadiusM: num(row.duplicate_radius_m),
    duplicateNameSimilarity: num(row.duplicate_name_similarity),
    offlineMaxDistanceM: num(row.offline_max_distance_m),
    dailySubmissionCap: num(row.daily_submission_cap),
    spotCheckBps: num(row.spot_check_bps),
    reviewGraceDays: num(row.review_grace_days),
    evidenceRetentionDays: num(row.evidence_retention_days),
    notifyPushEnabled: row.notify_push_enabled !== false,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function readSettings(
  supabase: ServiceRoleClient,
): Promise<FieldOpsProgramSettings | null> {
  const { data, error } = await supabase
    .from("fieldops_program_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) {
    logger.error(`fieldOps readSettings failed: ${error?.message ?? "no row"}`);
    return null;
  }
  return mapSettings(data as unknown as SettingsRow);
}

// ── Regions & territories ───────────────────────────────────

export type RegionRow = {
  id: string;
  name: string;
  country_code: string;
  admin_code: string | null;
  centre_lat: number | null;
  centre_lng: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function mapRegion(
  row: RegionRow,
  extra: { territoryCount: number; liveCampaignId: string | null },
): FieldOpsRegion {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.country_code,
    adminCode: row.admin_code,
    centre:
      row.centre_lat !== null && row.centre_lng !== null
        ? { lat: row.centre_lat, lng: row.centre_lng }
        : null,
    status: row.status as FieldOpsRegion["status"],
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    territoryCount: extra.territoryCount,
    liveCampaignId: extra.liveCampaignId,
  };
}

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

// ── Campaigns ───────────────────────────────────────────────

export type CampaignRow = {
  id: string;
  region_id: string;
  name: string;
  slug: string;
  status: string;
  currency: string;
  starts_on: string | null;
  ends_on: string | null;
  budget_cap_minor: number | string | null;
  holding_days_override: number | null;
  description: string | null;
  status_changed_at: string;
  status_changed_by: string | null;
  activated_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const EMPTY_COUNTS: Record<FieldOpsMemberRole, number> = {
  team_lead: 0,
  content_creator: 0,
  offline_member: 0,
  online_member: 0,
};

export function mapCampaign(
  row: CampaignRow,
  extra: {
    regionName: string;
    teamId: string | null;
    memberCounts?: Record<FieldOpsMemberRole, number>;
    activeMemberCount?: number;
  },
): FieldOpsCampaign {
  return {
    id: row.id,
    regionId: row.region_id,
    regionName: extra.regionName,
    name: row.name,
    slug: row.slug,
    status: row.status as FieldOpsCampaignStatus,
    currency: row.currency,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    budgetCapMinor:
      row.budget_cap_minor === null ? null : num(row.budget_cap_minor),
    holdingDaysOverride: row.holding_days_override,
    description: row.description,
    statusChangedAt: row.status_changed_at,
    statusChangedBy: row.status_changed_by,
    activatedAt: row.activated_at,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    teamId: extra.teamId,
    memberCounts: extra.memberCounts ?? { ...EMPTY_COUNTS },
    activeMemberCount: extra.activeMemberCount ?? 0,
  };
}

/**
 * Member counts per campaign (active members only) and the team id, in one
 * query each -- the campaign list is small (one per region run).
 */
export async function campaignTeamSummaries(
  supabase: ServiceRoleClient,
  campaignIds: string[],
): Promise<
  Map<
    string,
    {
      teamId: string | null;
      memberCounts: Record<FieldOpsMemberRole, number>;
      activeMemberCount: number;
    }
  >
> {
  const map = new Map<
    string,
    {
      teamId: string | null;
      memberCounts: Record<FieldOpsMemberRole, number>;
      activeMemberCount: number;
    }
  >();
  if (campaignIds.length === 0) return map;
  for (const id of campaignIds) {
    map.set(id, {
      teamId: null,
      memberCounts: { ...EMPTY_COUNTS },
      activeMemberCount: 0,
    });
  }
  const [{ data: teams }, { data: members }] = await Promise.all([
    supabase
      .from("fieldops_team")
      .select("id, campaign_id")
      .in("campaign_id", campaignIds)
      .order("created_at"),
    supabase
      .from("fieldops_team_member")
      .select("campaign_id, role, status")
      .in("campaign_id", campaignIds)
      .eq("status", "active"),
  ]);
  for (const t of teams ?? []) {
    const entry = map.get(t.campaign_id);
    if (entry && !entry.teamId) entry.teamId = t.id;
  }
  for (const m of members ?? []) {
    const entry = map.get(m.campaign_id);
    if (!entry) continue;
    entry.memberCounts[m.role as FieldOpsMemberRole] += 1;
    entry.activeMemberCount += 1;
  }
  return map;
}

// ── Team members ────────────────────────────────────────────

export type MemberRow = {
  id: string;
  team_id: string;
  campaign_id: string;
  user_id: string | null;
  invited_phone_e164: string | null;
  full_name_snapshot: string | null;
  role: string;
  status: string;
  joined_at: string | null;
  left_at: string | null;
  suspended_reason: string | null;
  payout_momo_number: string | null;
  payout_momo_network: string | null;
  created_at: string;
};

export const MEMBER_COLUMNS =
  "id, team_id, campaign_id, user_id, invited_phone_e164, full_name_snapshot, role, status, joined_at, left_at, suspended_reason, payout_momo_number, payout_momo_network, created_at";

export async function mapMembers(
  supabase: ServiceRoleClient,
  rows: MemberRow[],
  opts: { includePhoneVerified: boolean },
): Promise<FieldOpsTeamMember[]> {
  const names = await namesFor(
    supabase,
    rows.map((r) => r.user_id),
  );
  const verified = new Map<string, boolean>();
  if (opts.includePhoneVerified) {
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    // auth.users isn't reachable through PostgREST; the Admin API is.
    await Promise.all(
      ids.map(async (id) => {
        const { data } = await supabase.auth.admin.getUserById(id as string);
        verified.set(id as string, Boolean(data.user?.phone_confirmed_at));
      }),
    );
  }
  return rows.map((r) => {
    const n = r.user_id ? names.get(r.user_id) : undefined;
    return {
      id: r.id,
      teamId: r.team_id,
      campaignId: r.campaign_id,
      userId: r.user_id,
      invitedPhoneMasked: r.invited_phone_e164
        ? maskPhoneNumber(r.invited_phone_e164)
        : null,
      fullName: r.full_name_snapshot ?? displayName(n),
      username: n?.username ?? null,
      role: r.role as FieldOpsMemberRole,
      status: r.status as FieldOpsMemberStatus,
      joinedAt: r.joined_at,
      leftAt: r.left_at,
      suspendedReason: r.suspended_reason,
      phoneVerified: r.user_id ? (verified.get(r.user_id) ?? null) : null,
      payoutDestinationMasked: r.payout_momo_number
        ? `${r.payout_momo_network ?? "MoMo"} ${maskAccountNumber(r.payout_momo_number)}`
        : null,
      createdAt: r.created_at,
    };
  });
}

// ── Commission rules ────────────────────────────────────────

export type RuleRow = {
  id: string;
  campaign_id: string | null;
  activity_key: string;
  version: number;
  is_active: boolean;
  amount_minor: number | string;
  currency: string;
  eligibility: unknown;
  effective_from: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export async function mapRules(
  supabase: ServiceRoleClient,
  rows: RuleRow[],
): Promise<FieldOpsCommissionRule[]> {
  const names = await namesFor(
    supabase,
    rows.map((r) => r.created_by),
  );
  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    activityKey: r.activity_key as FieldOpsActivityKey,
    version: r.version,
    isActive: r.is_active,
    amountMinor: num(r.amount_minor),
    currency: r.currency,
    eligibility: (r.eligibility ?? {}) as Record<string, unknown>,
    effectiveFrom: r.effective_from,
    note: r.note,
    createdBy: r.created_by,
    createdByName: r.created_by ? displayName(names.get(r.created_by)) : null,
    createdAt: r.created_at,
  }));
}

export const ACTIVITY_LABEL: Record<FieldOpsActivityKey, string> = {
  place_onboarding_offline: "Place onboarding (offline team)",
  place_onboarding_online: "Place onboarding (online team)",
  event_onboarding_offline: "Event onboarding (offline team)",
  event_onboarding_online: "Event onboarding (online team)",
  existing_place_claim_assist: "Claim assistance for an existing place",
  content_deliverable: "Content deliverable",
  content_monthly_stipend: "Content creator monthly stipend",
  team_lead_monthly_stipend: "Team lead monthly stipend",
};
