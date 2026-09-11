import { validatePolygon } from "@abonten/core/fieldOps/territory";
import type {
  FieldOpsTerritory,
  GeoJsonPolygon,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import {
  type FieldOpsEnvelope,
  TERRITORY_COLUMNS,
  type TerritoryRow,
  dbErr,
  mapTerritory,
  pointWkt,
  polygonWkt,
} from "../shared/fieldOpsRows";

// A team lead's territory management, limited to their campaign's region:
// add a town or area, edit it, mark it completed or active again. Retiring
// a territory stays an admin action (Admin > Field Ops > Regions).

const EDITABLE_STATUSES = new Set([
  "draft",
  "active",
  "paused",
  "winding_down",
]);

export type LeadTerritoryInput = {
  campaignId: string;
  id?: string;
  parentTerritoryId?: string | null;
  name: string;
  kind: "town" | "area";
  centre: { lat: number; lng: number };
  radiusM: number;
  boundary?: GeoJsonPolygon | null;
  priority?: number;
  notes?: string | null;
};

export async function listLeadTerritoriesCore(
  supabase: ServiceRoleClient,
  userId: string,
  campaignId: string,
): Promise<FieldOpsEnvelope<FieldOpsTerritory[]>> {
  let regionId: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    regionId = requireMembership(ctx, campaignId, ["team_lead"]).regionId;
  } catch (e) {
    return fieldOpsError(e);
  }
  const { data, error } = await supabase
    .from("fieldops_territory")
    .select(TERRITORY_COLUMNS)
    .eq("region_id", regionId)
    .neq("status", "retired")
    .order("status")
    .order("priority", { ascending: false })
    .order("name");
  if (error) return dbErr(error, "Could not load territories");
  return {
    status: 200,
    data: ((data ?? []) as TerritoryRow[]).map(mapTerritory),
  };
}

export async function upsertLeadTerritoryCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: LeadTerritoryInput,
): Promise<FieldOpsEnvelope<FieldOpsTerritory>> {
  let regionId: string;
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId, ["team_lead"]);
    regionId = m.regionId;
    campaignStatus = m.campaignStatus;
  } catch (e) {
    return fieldOpsError(e);
  }
  if (!EDITABLE_STATUSES.has(campaignStatus)) {
    return { status: 409, message: "The campaign is closed." };
  }
  if (input.boundary) {
    const problem = validatePolygon(input.boundary);
    if (problem) return { status: 400, message: problem };
  }
  if (input.parentTerritoryId) {
    if (input.parentTerritoryId === input.id) {
      return { status: 400, message: "A territory can't be its own parent." };
    }
    const { data: parent } = await supabase
      .from("fieldops_territory")
      .select("id")
      .eq("id", input.parentTerritoryId)
      .eq("region_id", regionId)
      .maybeSingle();
    if (!parent) {
      return { status: 400, message: "The parent town isn't in this region." };
    }
  }
  const values = {
    parent_territory_id: input.parentTerritoryId ?? null,
    name: input.name,
    kind: input.kind,
    centre: pointWkt(input.centre),
    radius_m: input.radiusM,
    boundary: input.boundary ? polygonWkt(input.boundary) : null,
    priority: input.priority ?? 0,
    notes: input.notes ?? null,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("fieldops_territory")
      .update(values as never)
      .eq("id", input.id)
      .eq("region_id", regionId)
      .neq("status", "retired")
      .select(TERRITORY_COLUMNS)
      .maybeSingle();
    if (error) return dbErr(error, "Could not save the territory");
    if (!data) return { status: 404, message: "Territory not found" };
    return {
      status: 200,
      message: "Territory saved.",
      data: mapTerritory(data as TerritoryRow),
    };
  }
  const { data, error } = await supabase
    .from("fieldops_territory")
    .insert({ ...values, region_id: regionId, created_by: userId } as never)
    .select(TERRITORY_COLUMNS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return {
        status: 409,
        message: "A territory with that name already exists in this region.",
      };
    }
    return dbErr(
      error ?? { message: "insert failed" },
      "Could not add the territory",
    );
  }
  return {
    status: 200,
    message: "Territory added.",
    data: mapTerritory(data as TerritoryRow),
  };
}

export async function setLeadTerritoryStatusCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    campaignId: string;
    territoryId: string;
    status: "active" | "completed";
  },
): Promise<FieldOpsEnvelope<FieldOpsTerritory>> {
  let regionId: string;
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId, ["team_lead"]);
    regionId = m.regionId;
    campaignStatus = m.campaignStatus;
  } catch (e) {
    return fieldOpsError(e);
  }
  if (!EDITABLE_STATUSES.has(campaignStatus)) {
    return { status: 409, message: "The campaign is closed." };
  }
  const { data, error } = await supabase
    .from("fieldops_territory")
    .update({ status: input.status } as never)
    .eq("id", input.territoryId)
    .eq("region_id", regionId)
    .neq("status", "retired")
    .select(TERRITORY_COLUMNS)
    .maybeSingle();
  if (error) return dbErr(error, "Could not update the territory");
  if (!data) return { status: 404, message: "Territory not found" };
  return {
    status: 200,
    message:
      input.status === "completed"
        ? "Territory marked completed."
        : "Territory reopened.",
    data: mapTerritory(data as TerritoryRow),
  };
}
