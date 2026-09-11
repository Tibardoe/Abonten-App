import type {
  FieldOpsLeadDashboard,
  FieldOpsMemberRole,
  FieldOpsTerritoryBoardRow,
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
  TERRITORY_COLUMNS,
  type TerritoryRow,
  campaignSummary,
  dbErr,
  mapAssignments,
  mapTerritory,
  todayIso,
} from "../shared/fieldOpsRows";

// The team lead's dashboard: the coverage board (every territory in the
// region with who is on it), today's assignments and the team headcount.
// Coverage is always computed from records, never stored.

export async function getLeadDashboardCore(
  supabase: ServiceRoleClient,
  userId: string,
  campaignId: string,
): Promise<FieldOpsEnvelope<FieldOpsLeadDashboard>> {
  let regionId: string;
  let teamId: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, campaignId, ["team_lead"]);
    regionId = m.regionId;
    teamId = m.teamId;
  } catch (e) {
    return fieldOpsError(e);
  }
  const today = todayIso();
  const [
    campaign,
    { data: territories, error: tErr },
    { data: open },
    { data: todayRows },
    { data: prospects },
    { data: members },
  ] = await Promise.all([
    campaignSummary(supabase, campaignId),
    supabase
      .from("fieldops_territory")
      .select(TERRITORY_COLUMNS)
      .eq("region_id", regionId)
      .neq("status", "retired")
      .order("priority", { ascending: false })
      .order("name"),
    supabase
      .from("fieldops_assignment")
      .select(ASSIGNMENT_COLUMNS)
      .eq("campaign_id", campaignId)
      .in("status", ["assigned", "started"]),
    supabase
      .from("fieldops_assignment")
      .select(ASSIGNMENT_COLUMNS)
      .eq("campaign_id", campaignId)
      .lte("starts_on", today)
      .gte("ends_on", today)
      .neq("status", "cancelled")
      .order("status"),
    supabase
      .from("fieldops_prospect")
      .select("territory_id")
      .eq("campaign_id", campaignId),
    supabase
      .from("fieldops_team_member")
      .select("id, role, status, full_name_snapshot, user_id")
      .eq("team_id", teamId),
  ]);
  if (!campaign) return { status: 404, message: "Campaign not found" };
  if (tErr) return dbErr(tErr, "Could not load territories");

  const openAssignments = await mapAssignments(
    supabase,
    (open ?? []) as AssignmentRow[],
  );
  const openByTerritory = new Map<string, typeof openAssignments>();
  for (const a of openAssignments) {
    const list = openByTerritory.get(a.territoryId) ?? [];
    list.push(a);
    openByTerritory.set(a.territoryId, list);
  }
  const prospectCount = new Map<string, number>();
  for (const p of prospects ?? []) {
    prospectCount.set(
      p.territory_id,
      (prospectCount.get(p.territory_id) ?? 0) + 1,
    );
  }

  const board: FieldOpsTerritoryBoardRow[] = (
    (territories ?? []) as TerritoryRow[]
  ).map((row) => {
    const t = mapTerritory(row);
    const here = openByTerritory.get(t.id) ?? [];
    return {
      ...t,
      coverage:
        t.status === "completed"
          ? "completed"
          : here.length > 0
            ? "covered"
            : "uncovered",
      openAssignments: here.map((a) => ({
        id: a.id,
        memberId: a.memberId,
        memberName: a.memberName,
        mode: a.mode,
        status: a.status,
        startsOn: a.startsOn,
        endsOn: a.endsOn,
      })),
      prospectCount: prospectCount.get(t.id) ?? 0,
    };
  });
  const notUncovered = board.filter((t) => t.coverage !== "uncovered").length;

  const team = { active: 0, invited: 0, suspended: 0 };
  const assignableMembers: FieldOpsLeadDashboard["assignableMembers"] = [];
  for (const m of members ?? []) {
    if (m.status === "active") team.active++;
    else if (m.status === "invited") team.invited++;
    else if (m.status === "suspended") team.suspended++;
    if (
      m.status === "active" &&
      (m.role === "offline_member" || m.role === "online_member")
    ) {
      assignableMembers.push({
        id: m.id,
        name: m.full_name_snapshot,
        role: m.role as FieldOpsMemberRole,
      });
    }
  }

  return {
    status: 200,
    data: {
      campaign,
      today,
      territories: board,
      coveragePct:
        board.length === 0
          ? 0
          : Math.round((notUncovered / board.length) * 100),
      todayAssignments: await mapAssignments(
        supabase,
        (todayRows ?? []) as AssignmentRow[],
      ),
      team,
      assignableMembers,
    },
  };
}
