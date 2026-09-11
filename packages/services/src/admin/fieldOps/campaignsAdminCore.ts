import {
  campaignSlug,
  nextCampaignStatus,
} from "@abonten/core/fieldOps/campaignLifecycle";
import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  FieldOpsCampaign,
  FieldOpsCampaignAction,
  FieldOpsCampaignStatus,
  FieldOpsCommissionRule,
  FieldOpsTeamMember,
  FieldOpsTerritory,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import {
  type CampaignRow,
  MEMBER_COLUMNS,
  type MemberRow,
  type RequestMeta,
  type RuleRow,
  TERRITORY_COLUMNS,
  type TerritoryRow,
  campaignTeamSummaries,
  dbError,
  denied,
  mapCampaign,
  mapMembers,
  mapRules,
  mapTerritory,
} from "./fieldOpsAdminShared";

// Campaigns (Admin > Field Ops > Campaigns). A campaign is one region run.
// Status moves only through fieldops_set_campaign_status, which holds the
// same transition table as @abonten/core/fieldOps/campaignLifecycle and
// refuses activation without territories and a team lead.

const CAMPAIGN_COLUMNS = "*";

async function regionNames(
  supabase: ServiceRoleClient,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from("fieldops_region")
    .select("id, name")
    .in("id", unique);
  for (const r of data ?? []) map.set(r.id, r.name);
  return map;
}

export type ListCampaignsFilters = {
  status?: FieldOpsCampaignStatus | "live" | "all";
  regionId?: string;
};

export async function listCampaignsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: ListCampaignsFilters = {},
): Promise<AdminEnvelope<FieldOpsCampaign[]>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  let q = supabase
    .from("fieldops_campaign")
    .select(CAMPAIGN_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.status === "live") {
    q = q.in("status", ["active", "paused", "winding_down"]);
  } else if (filters.status && filters.status !== "all") {
    q = q.eq("status", filters.status);
  }
  if (filters.regionId) q = q.eq("region_id", filters.regionId);
  const { data, error } = await q;
  if (error) return dbError(error, "Could not load campaigns");
  const rows = (data ?? []) as unknown as CampaignRow[];
  const [names, teams] = await Promise.all([
    regionNames(
      supabase,
      rows.map((r) => r.region_id),
    ),
    campaignTeamSummaries(
      supabase,
      rows.map((r) => r.id),
    ),
  ]);
  return {
    status: 200,
    data: rows.map((r) =>
      mapCampaign(r, {
        regionName: names.get(r.region_id) ?? "—",
        ...(teams.get(r.id) ?? { teamId: null }),
      }),
    ),
  };
}

export type CampaignDetail = {
  campaign: FieldOpsCampaign;
  territories: FieldOpsTerritory[];
  members: FieldOpsTeamMember[];
  rules: FieldOpsCommissionRule[];
};

export async function getCampaignDetailCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  campaignId: string,
): Promise<AdminEnvelope<CampaignDetail>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const { data: row, error } = await supabase
    .from("fieldops_campaign")
    .select(CAMPAIGN_COLUMNS)
    .eq("id", campaignId)
    .maybeSingle();
  if (error) return dbError(error, "Could not load the campaign");
  if (!row) return { status: 404, message: "Campaign not found" };
  const campaign = row as unknown as CampaignRow;

  const [
    names,
    teams,
    { data: territories },
    { data: members },
    { data: rules },
  ] = await Promise.all([
    regionNames(supabase, [campaign.region_id]),
    campaignTeamSummaries(supabase, [campaign.id]),
    supabase
      .from("fieldops_territory")
      .select(TERRITORY_COLUMNS)
      .eq("region_id", campaign.region_id)
      .neq("status", "retired")
      .order("priority", { ascending: false })
      .order("name"),
    supabase
      .from("fieldops_team_member")
      .select(MEMBER_COLUMNS)
      .eq("campaign_id", campaign.id)
      .order("role")
      .order("created_at"),
    supabase
      .from("fieldops_commission_rule")
      .select("*")
      .or(`campaign_id.eq.${campaign.id},campaign_id.is.null`)
      .eq("is_active", true)
      .order("activity_key"),
  ]);

  // A campaign-specific live rule overrides the programme default for the
  // same activity.
  const liveRules = new Map<string, RuleRow>();
  for (const r of (rules ?? []) as unknown as RuleRow[]) {
    const existing = liveRules.get(r.activity_key);
    if (
      !existing ||
      (existing.campaign_id === null && r.campaign_id !== null)
    ) {
      liveRules.set(r.activity_key, r);
    }
  }

  return {
    status: 200,
    data: {
      campaign: mapCampaign(campaign, {
        regionName: names.get(campaign.region_id) ?? "—",
        ...(teams.get(campaign.id) ?? { teamId: null }),
      }),
      territories: ((territories ?? []) as unknown as TerritoryRow[]).map(
        mapTerritory,
      ),
      members: await mapMembers(
        supabase,
        (members ?? []) as unknown as MemberRow[],
        { includePhoneVerified: false },
      ),
      rules: await mapRules(supabase, [...liveRules.values()]),
    },
  };
}

export type UpsertCampaignInput = {
  id?: string;
  regionId: string;
  name: string;
  currency: string;
  startsOn?: string | null;
  endsOn?: string | null;
  budgetCapMinor?: number | null;
  holdingDaysOverride?: number | null;
  description?: string | null;
};

export async function upsertCampaignCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: UpsertCampaignInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ id: string }>> {
  try {
    assertPermission(ctx, "fieldops.manage");
  } catch (e) {
    return denied(e);
  }
  const values = {
    region_id: input.regionId,
    name: input.name,
    currency: input.currency,
    starts_on: input.startsOn ?? null,
    ends_on: input.endsOn ?? null,
    budget_cap_minor: input.budgetCapMinor ?? null,
    holding_days_override: input.holdingDaysOverride ?? null,
    description: input.description ?? null,
  };

  if (input.id) {
    const { data: before } = await supabase
      .from("fieldops_campaign")
      .select(CAMPAIGN_COLUMNS)
      .eq("id", input.id)
      .maybeSingle();
    if (!before) return { status: 404, message: "Campaign not found" };
    const current = before as unknown as CampaignRow;
    // The region is fixed once a campaign has run: territories, assignments
    // and onboardings all hang off it.
    if (current.status !== "draft" && current.region_id !== input.regionId) {
      return {
        status: 409,
        message:
          "The region can only be changed while the campaign is a draft.",
      };
    }
    if (current.status === "archived") {
      return { status: 409, message: "An archived campaign is read-only." };
    }
    const { error } = await supabase
      .from("fieldops_campaign")
      .update(values as never)
      .eq("id", input.id);
    if (error) return dbError(error, "Could not save the campaign");
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "fieldops.campaign.update",
      targetType: "fieldops_campaign",
      targetId: input.id,
      summary: `Campaign "${input.name}" updated`,
      before: current as unknown as Record<string, unknown>,
      after: { ...input },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    return { status: 200, message: "Campaign saved.", data: { id: input.id } };
  }

  const slugBase = campaignSlug(input.name) || "campaign";
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await supabase
    .from("fieldops_campaign")
    .insert({
      ...values,
      slug,
      status: "draft",
      status_changed_by: ctx.userId,
      created_by: ctx.userId,
    } as never)
    .select("id")
    .single();
  if (error || !data) {
    return dbError(
      error ?? { message: "insert failed" },
      "Could not create the campaign",
    );
  }
  // One team per campaign in version 1; the table allows more later.
  const { error: teamError } = await supabase
    .from("fieldops_team")
    .insert({ campaign_id: data.id, name: "Team 1" } as never);
  if (teamError) return dbError(teamError, "Could not create the team");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.campaign.create",
    targetType: "fieldops_campaign",
    targetId: data.id,
    summary: `Campaign "${input.name}" created (draft)`,
    after: { ...input, slug },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message: "Campaign created as a draft.",
    data: { id: data.id },
  };
}

export async function setCampaignStatusCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { campaignId: string; action: FieldOpsCampaignAction; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ status: FieldOpsCampaignStatus }>> {
  try {
    assertPermission(ctx, "fieldops.manage");
  } catch (e) {
    return denied(e);
  }
  const { data: current } = await supabase
    .from("fieldops_campaign")
    .select("id, name, status")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (!current) return { status: 404, message: "Campaign not found" };

  const target = nextCampaignStatus(
    current.status as FieldOpsCampaignStatus,
    input.action,
  );
  if (!target) {
    return {
      status: 409,
      message: `A ${current.status.replace("_", " ")} campaign can't be ${input.action.replace("_", " ")}d.`,
    };
  }

  const { data, error } = await supabase.rpc("fieldops_set_campaign_status", {
    p_campaign_id: input.campaignId,
    p_status: target,
    p_actor: ctx.userId,
  });
  if (error) return dbError(error, "Could not change the campaign status");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: `fieldops.campaign.${input.action}`,
    targetType: "fieldops_campaign",
    targetId: input.campaignId,
    summary: `Campaign "${current.name}": ${current.status} → ${target}`,
    reason: input.reason,
    before: { status: current.status },
    after: { status: target },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  const row = data as unknown as { status?: string } | null;
  return {
    status: 200,
    message: `The campaign is now ${(row?.status ?? target).replace("_", " ")}.`,
    data: { status: (row?.status ?? target) as FieldOpsCampaignStatus },
  };
}
