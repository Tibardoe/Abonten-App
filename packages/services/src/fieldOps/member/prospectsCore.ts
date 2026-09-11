import type {
  FieldOpsContactAttempt,
  FieldOpsContactChannel,
  FieldOpsContactOutcome,
  FieldOpsProspect,
  FieldOpsProspectKind,
  FieldOpsProspectStatus,
  FieldOpsTerritoryView,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import {
  ASSIGNMENT_COLUMNS,
  type AssignmentRow,
  type FieldOpsEnvelope,
  PROSPECT_COLUMNS,
  type ProspectRow,
  TERRITORY_COLUMNS,
  type TerritoryRow,
  campaignSummary,
  dbErr,
  mapAssignments,
  mapProspects,
  mapTerritory,
} from "../shared/fieldOpsRows";

// Prospects: the businesses and organizers a member identifies in the
// territory they are assigned to. A member logs and updates their own;
// the team lead sees the team's. From Phase 2 the onboarding wizard starts
// from a prospect.

const FIELD_ROLES = ["offline_member", "online_member"] as const;
const PROSPECTING_STATUSES = new Set(["active", "winding_down"]);

async function territoryInCampaign(
  supabase: ServiceRoleClient,
  regionId: string,
  territoryId: string,
): Promise<TerritoryRow | null> {
  const { data } = await supabase
    .from("fieldops_territory")
    .select(TERRITORY_COLUMNS)
    .eq("id", territoryId)
    .eq("region_id", regionId)
    .maybeSingle();
  return (data as TerritoryRow | null) ?? null;
}

async function hasOpenAssignment(
  supabase: ServiceRoleClient,
  userId: string,
  campaignId: string,
  territoryId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("fieldops_assignment")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("member_user_id", userId)
    .eq("territory_id", territoryId)
    .in("status", ["assigned", "started"]);
  return (count ?? 0) > 0;
}

/** A territory with the caller's assignments and prospects there. */
export async function getTerritoryViewCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; territoryId: string },
): Promise<FieldOpsEnvelope<FieldOpsTerritoryView>> {
  let regionId: string;
  let role: string;
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId);
    regionId = m.regionId;
    role = m.role;
    campaignStatus = m.campaignStatus;
  } catch (e) {
    return fieldOpsError(e);
  }
  const territory = await territoryInCampaign(
    supabase,
    regionId,
    input.territoryId,
  );
  if (!territory) return { status: 404, message: "Territory not found" };
  const isLead = role === "team_lead";

  const [campaign, { data: assignments }, { data: prospects }] =
    await Promise.all([
      campaignSummary(supabase, input.campaignId),
      supabase
        .from("fieldops_assignment")
        .select(ASSIGNMENT_COLUMNS)
        .eq("campaign_id", input.campaignId)
        .eq("territory_id", input.territoryId)
        .eq("member_user_id", userId)
        .order("starts_on", { ascending: false }),
      (isLead
        ? supabase
            .from("fieldops_prospect")
            .select(PROSPECT_COLUMNS)
            .eq("campaign_id", input.campaignId)
            .eq("territory_id", input.territoryId)
        : supabase
            .from("fieldops_prospect")
            .select(PROSPECT_COLUMNS)
            .eq("campaign_id", input.campaignId)
            .eq("territory_id", input.territoryId)
            .eq("member_user_id", userId)
      )
        .order("updated_at", { ascending: false })
        .limit(300),
    ]);
  if (!campaign) return { status: 404, message: "Campaign not found" };

  const myAssignments = await mapAssignments(
    supabase,
    (assignments ?? []) as AssignmentRow[],
  );
  const canAddProspects =
    !isLead &&
    PROSPECTING_STATUSES.has(campaignStatus) &&
    myAssignments.some(
      (a) => a.status === "assigned" || a.status === "started",
    );

  return {
    status: 200,
    data: {
      territory: mapTerritory(territory),
      campaign,
      myAssignments,
      prospects: mapProspects((prospects ?? []) as ProspectRow[], userId),
      canAddProspects,
    },
  };
}

export type CreateProspectInput = {
  campaignId: string;
  territoryId: string;
  kind: FieldOpsProspectKind;
  name: string;
  contactName?: string | null;
  contactPhoneE164?: string | null;
  contactChannel?: FieldOpsContactChannel | null;
  notes?: string | null;
};

export async function createProspectCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: CreateProspectInput,
): Promise<FieldOpsEnvelope<FieldOpsProspect>> {
  let membershipId: string;
  let teamId: string;
  let regionId: string;
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId, FIELD_ROLES);
    membershipId = m.membershipId;
    teamId = m.teamId;
    regionId = m.regionId;
    campaignStatus = m.campaignStatus;
  } catch (e) {
    return fieldOpsError(e);
  }
  if (!PROSPECTING_STATUSES.has(campaignStatus)) {
    return { status: 409, message: "The campaign isn't running right now." };
  }
  const territory = await territoryInCampaign(
    supabase,
    regionId,
    input.territoryId,
  );
  if (!territory) return { status: 404, message: "Territory not found" };
  if (
    !(await hasOpenAssignment(
      supabase,
      userId,
      input.campaignId,
      input.territoryId,
    ))
  ) {
    return {
      status: 409,
      message:
        "You can only log businesses in a territory you're currently assigned to.",
    };
  }
  const { data, error } = await supabase
    .from("fieldops_prospect")
    .insert({
      campaign_id: input.campaignId,
      team_id: teamId,
      territory_id: input.territoryId,
      member_id: membershipId,
      member_user_id: userId,
      kind: input.kind,
      name: input.name,
      contact_name: input.contactName ?? null,
      contact_phone_e164: input.contactPhoneE164 ?? null,
      contact_channel: input.contactChannel ?? null,
      notes: input.notes ?? null,
    } as never)
    .select(PROSPECT_COLUMNS)
    .single();
  if (error || !data) {
    return dbErr(
      error ?? { message: "insert failed" },
      "Could not save the business",
    );
  }
  const [mapped] = mapProspects([data as ProspectRow], userId);
  return { status: 200, message: "Business logged.", data: mapped };
}

export type UpdateProspectInput = {
  campaignId: string;
  prospectId: string;
  status?: Exclude<FieldOpsProspectStatus, "converted">;
  contactAttempt?: {
    channel: FieldOpsContactChannel;
    outcome: FieldOpsContactOutcome;
    note?: string | null;
  };
  contactName?: string | null;
  contactPhoneE164?: string | null;
  notes?: string | null;
};

/**
 * Updates the caller's own prospect: a status change, a logged contact
 * attempt (appended, never edited; it also moves the status forward when
 * no explicit status is given), or contact details.
 */
export async function updateProspectCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: UpdateProspectInput,
): Promise<FieldOpsEnvelope<FieldOpsProspect>> {
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    campaignStatus = requireMembership(
      ctx,
      input.campaignId,
      FIELD_ROLES,
    ).campaignStatus;
  } catch (e) {
    return fieldOpsError(e);
  }
  if (!PROSPECTING_STATUSES.has(campaignStatus)) {
    return { status: 409, message: "The campaign isn't running right now." };
  }
  const { data: current } = await supabase
    .from("fieldops_prospect")
    .select(PROSPECT_COLUMNS)
    .eq("id", input.prospectId)
    .eq("campaign_id", input.campaignId)
    .eq("member_user_id", userId)
    .maybeSingle();
  if (!current) return { status: 404, message: "Business not found" };
  const row = current as ProspectRow;
  if (row.status === "converted") {
    return {
      status: 409,
      message: "This business has been onboarded; nothing more to log.",
    };
  }

  const update: Record<string, unknown> = {};
  let nextStatus = input.status ?? null;
  if (input.contactAttempt) {
    const attempts = Array.isArray(row.contact_attempts)
      ? (row.contact_attempts as FieldOpsContactAttempt[])
      : [];
    if (attempts.length >= 50) {
      return { status: 409, message: "Too many contact attempts logged." };
    }
    update.contact_attempts = [
      ...attempts,
      {
        at: new Date().toISOString(),
        channel: input.contactAttempt.channel,
        outcome: input.contactAttempt.outcome,
        note: input.contactAttempt.note ?? null,
      },
    ];
    if (!nextStatus) {
      nextStatus =
        input.contactAttempt.outcome === "interested"
          ? "interested"
          : input.contactAttempt.outcome === "declined"
            ? "declined"
            : row.status === "identified"
              ? "contacted"
              : null;
    }
  }
  if (nextStatus && nextStatus !== row.status) update.status = nextStatus;
  if (input.contactName !== undefined) update.contact_name = input.contactName;
  if (input.contactPhoneE164 !== undefined) {
    update.contact_phone_e164 = input.contactPhoneE164;
  }
  if (input.notes !== undefined) update.notes = input.notes;
  if (Object.keys(update).length === 0) {
    return { status: 400, message: "Nothing changed." };
  }

  const { data, error } = await supabase
    .from("fieldops_prospect")
    .update(update as never)
    .eq("id", row.id)
    .select(PROSPECT_COLUMNS)
    .single();
  if (error || !data) {
    return dbErr(
      error ?? { message: "update failed" },
      "Could not update the business",
    );
  }
  const [mapped] = mapProspects([data as ProspectRow], userId);
  return { status: 200, message: "Saved.", data: mapped };
}
