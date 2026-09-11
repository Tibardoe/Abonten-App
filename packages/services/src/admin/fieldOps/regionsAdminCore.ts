import { validatePolygon } from "@abonten/core/fieldOps/territory";
import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  FieldOpsRegion,
  FieldOpsTerritory,
  FieldOpsTerritoryStatus,
  GeoJsonPolygon,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import {
  type RegionRow,
  type RequestMeta,
  TERRITORY_COLUMNS,
  type TerritoryRow,
  dbError,
  denied,
  mapRegion,
  mapTerritory,
  pointWkt,
  polygonWkt,
} from "./fieldOpsAdminShared";

// Regions and territories (Admin > Field Ops > Regions). Territories are
// point + radius by default; a GeoJSON polygon, when set, wins (see
// fieldops_territory_contains). Members read these under RLS; only admins
// write them.

const REGION_COLUMNS =
  "id, name, country_code, admin_code, centre_lat, centre_lng, status, notes, created_at, updated_at";

async function regionExtras(
  supabase: ServiceRoleClient,
  regionIds: string[],
): Promise<
  Map<string, { territoryCount: number; liveCampaignId: string | null }>
> {
  const map = new Map<
    string,
    { territoryCount: number; liveCampaignId: string | null }
  >();
  for (const id of regionIds)
    map.set(id, { territoryCount: 0, liveCampaignId: null });
  if (regionIds.length === 0) return map;
  const [{ data: territories }, { data: campaigns }] = await Promise.all([
    supabase
      .from("fieldops_territory")
      .select("region_id")
      .in("region_id", regionIds)
      .neq("status", "retired"),
    supabase
      .from("fieldops_campaign")
      .select("id, region_id")
      .in("region_id", regionIds)
      .in("status", ["active", "paused", "winding_down"]),
  ]);
  for (const t of territories ?? []) {
    const e = map.get(t.region_id);
    if (e) e.territoryCount += 1;
  }
  for (const c of campaigns ?? []) {
    const e = map.get(c.region_id);
    if (e) e.liveCampaignId = c.id;
  }
  return map;
}

export async function listRegionsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<FieldOpsRegion[]>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase
    .from("fieldops_region")
    .select(REGION_COLUMNS)
    .order("status")
    .order("name");
  if (error) return dbError(error, "Could not load regions");
  const rows = (data ?? []) as unknown as RegionRow[];
  const extras = await regionExtras(
    supabase,
    rows.map((r) => r.id),
  );
  return {
    status: 200,
    data: rows.map((r) =>
      mapRegion(
        r,
        extras.get(r.id) ?? { territoryCount: 0, liveCampaignId: null },
      ),
    ),
  };
}

export async function getRegionDetailCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  regionId: string,
): Promise<
  AdminEnvelope<{ region: FieldOpsRegion; territories: FieldOpsTerritory[] }>
> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const [{ data: region, error }, { data: territories, error: tErr }] =
    await Promise.all([
      supabase
        .from("fieldops_region")
        .select(REGION_COLUMNS)
        .eq("id", regionId)
        .maybeSingle(),
      supabase
        .from("fieldops_territory")
        .select(TERRITORY_COLUMNS)
        .eq("region_id", regionId)
        .order("status")
        .order("priority", { ascending: false })
        .order("name"),
    ]);
  if (error) return dbError(error, "Could not load the region");
  if (!region) return { status: 404, message: "Region not found" };
  if (tErr) return dbError(tErr, "Could not load territories");
  const extras = await regionExtras(supabase, [regionId]);
  return {
    status: 200,
    data: {
      region: mapRegion(
        region as unknown as RegionRow,
        extras.get(regionId) ?? { territoryCount: 0, liveCampaignId: null },
      ),
      territories: ((territories ?? []) as unknown as TerritoryRow[]).map(
        mapTerritory,
      ),
    },
  };
}

export type UpsertRegionInput = {
  id?: string;
  name: string;
  countryCode: string;
  adminCode?: string | null;
  centre?: { lat: number; lng: number } | null;
  status?: "active" | "retired";
  notes?: string | null;
};

export async function upsertRegionCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: UpsertRegionInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ id: string }>> {
  try {
    assertPermission(ctx, "fieldops.manage");
  } catch (e) {
    return denied(e);
  }
  const values = {
    name: input.name,
    country_code: input.countryCode,
    admin_code: input.adminCode ?? null,
    centre: input.centre ? pointWkt(input.centre) : null,
    notes: input.notes ?? null,
    ...(input.status ? { status: input.status } : {}),
  };

  if (input.id) {
    const { data: before } = await supabase
      .from("fieldops_region")
      .select(REGION_COLUMNS)
      .eq("id", input.id)
      .maybeSingle();
    if (!before) return { status: 404, message: "Region not found" };
    const { error } = await supabase
      .from("fieldops_region")
      .update(values as never)
      .eq("id", input.id);
    if (error) return dbError(error, "Could not save the region");
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "fieldops.region.update",
      targetType: "fieldops_region",
      targetId: input.id,
      summary: `Region "${input.name}" updated`,
      before: before as Record<string, unknown>,
      after: { ...input },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    return { status: 200, message: "Region saved.", data: { id: input.id } };
  }

  const { data, error } = await supabase
    .from("fieldops_region")
    .insert({ ...values, created_by: ctx.userId } as never)
    .select("id")
    .single();
  if (error || !data) {
    return dbError(
      error ?? { message: "insert failed" },
      "Could not create the region",
    );
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.region.create",
    targetType: "fieldops_region",
    targetId: data.id,
    summary: `Region "${input.name}" created`,
    after: { ...input },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Region created.", data: { id: data.id } };
}

export type UpsertTerritoryInput = {
  id?: string;
  regionId: string;
  parentTerritoryId?: string | null;
  name: string;
  kind: "town" | "area";
  centre: { lat: number; lng: number };
  radiusM: number;
  boundary?: GeoJsonPolygon | null;
  status?: FieldOpsTerritoryStatus;
  priority?: number;
  notes?: string | null;
};

export async function upsertTerritoryCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: UpsertTerritoryInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ id: string }>> {
  try {
    assertPermission(ctx, "fieldops.manage");
  } catch (e) {
    return denied(e);
  }
  if (input.boundary) {
    const problem = validatePolygon(input.boundary);
    if (problem) return { status: 400, message: problem };
  }
  if (input.parentTerritoryId && input.parentTerritoryId === input.id) {
    return { status: 400, message: "A territory can't be its own parent." };
  }
  const values = {
    region_id: input.regionId,
    parent_territory_id: input.parentTerritoryId ?? null,
    name: input.name,
    kind: input.kind,
    centre: pointWkt(input.centre),
    radius_m: input.radiusM,
    boundary: input.boundary ? polygonWkt(input.boundary) : null,
    priority: input.priority ?? 0,
    notes: input.notes ?? null,
    ...(input.status ? { status: input.status } : {}),
  };

  if (input.id) {
    const { data: before } = await supabase
      .from("fieldops_territory")
      .select(TERRITORY_COLUMNS)
      .eq("id", input.id)
      .maybeSingle();
    if (!before) return { status: 404, message: "Territory not found" };
    const { error } = await supabase
      .from("fieldops_territory")
      .update(values as never)
      .eq("id", input.id);
    if (error) return dbError(error, "Could not save the territory");
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "fieldops.territory.update",
      targetType: "fieldops_territory",
      targetId: input.id,
      summary: `Territory "${input.name}" updated`,
      before: before as Record<string, unknown>,
      after: { ...input, boundary: input.boundary ? "polygon" : null },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    return { status: 200, message: "Territory saved.", data: { id: input.id } };
  }

  const { data, error } = await supabase
    .from("fieldops_territory")
    .insert({ ...values, created_by: ctx.userId } as never)
    .select("id")
    .single();
  if (error || !data) {
    return dbError(
      error ?? { message: "insert failed" },
      "Could not create the territory",
    );
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.territory.create",
    targetType: "fieldops_territory",
    targetId: data.id,
    summary: `Territory "${input.name}" created`,
    after: { ...input, boundary: input.boundary ? "polygon" : null },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Territory created.", data: { id: data.id } };
}

/**
 * Turns a place name into coordinates through Google Geocoding, for the
 * "find on the map" button. Needs GOOGLE_MAPS_API_KEY (or the web app's
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) in the admin deployment; without a key
 * the admin types coordinates by hand.
 */
export async function geocodeQueryCore(
  ctx: AdminContext,
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AdminEnvelope<{ lat: number; lng: number; label: string }>> {
  try {
    assertPermission(ctx, "fieldops.manage");
  } catch (e) {
    return denied(e);
  }
  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return {
      status: 409,
      message:
        "Geocoding isn't set up on this deployment (no Google Maps key). Enter the coordinates by hand.",
    };
  }
  try {
    const res = await fetchImpl(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`,
    );
    const data = (await res.json()) as {
      status?: string;
      results?: {
        formatted_address?: string;
        geometry?: { location?: { lat: number; lng: number } };
      }[];
    };
    const first = data.results?.[0];
    if (data.status !== "OK" || !first?.geometry?.location) {
      return { status: 404, message: "No match for that place name." };
    }
    return {
      status: 200,
      data: {
        lat: first.geometry.location.lat,
        lng: first.geometry.location.lng,
        label: first.formatted_address ?? query,
      },
    };
  } catch (err) {
    logger.error("fieldOps geocode failed", err);
    return { status: 502, message: "Geocoding failed. Try again." };
  }
}
