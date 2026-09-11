import { logger } from "@abonten/core/logger";
import type { FieldOpsMe, FieldOpsMembership } from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { resolveFieldOpsContext } from "../shared/fieldOpsContext";
import {
  ASSIGNMENT_COLUMNS,
  type AssignmentRow,
  type FieldOpsEnvelope,
  campaignSummary,
  mapAssignments,
  todayIso,
} from "../shared/fieldOpsRows";

// Everything the /field "Today" screen (and the nav entry point) needs in
// one call: whether the programme is on, the caller's memberships, and the
// campaign /field should show with today's assignments and quick stats.
// Read-only; the transport resolves userId from the session.

const LIVE = new Set(["active", "paused", "winding_down"]);

function pickCurrent(
  memberships: FieldOpsMembership[],
): FieldOpsMembership | null {
  const usable = memberships.filter((m) => m.campaignStatus !== "archived");
  return (
    usable.find((m) => LIVE.has(m.campaignStatus)) ??
    usable.find((m) => m.campaignStatus === "draft") ??
    usable[0] ??
    null
  );
}

export async function getMyFieldOpsCore(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<FieldOpsEnvelope<FieldOpsMe>> {
  // A phone invitation binds the first time the person shows up here.
  const { error: bindError } = await supabase.rpc(
    "fieldops_bind_invited_memberships",
    { p_user_id: userId },
  );
  if (bindError) {
    logger.error(`fieldOps bind invitations failed: ${bindError.message}`);
  }

  const [ctx, { data: settings }] = await Promise.all([
    resolveFieldOpsContext(supabase, userId),
    supabase
      .from("fieldops_program_setting")
      .select("worker_ui_enabled")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  // The worker UI switch hides /field (and its entry points) without
  // switching the programme off: admins keep the console, the sweep keeps
  // running, members just can't open the pages.
  if (!ctx.programEnabled || settings?.worker_ui_enabled === false) {
    return {
      status: 200,
      data: { programEnabled: false, memberships: [], current: null },
    };
  }
  const membership = pickCurrent(ctx.memberships);
  if (!membership) {
    return {
      status: 200,
      data: {
        programEnabled: true,
        memberships: ctx.memberships,
        current: null,
      },
    };
  }

  const today = todayIso();
  const isLead = membership.role === "team_lead";
  const [campaign, { data: todayRows }, { data: allAssignments }, prospects] =
    await Promise.all([
      campaignSummary(supabase, membership.campaignId),
      isLead
        ? Promise.resolve({ data: [] as AssignmentRow[] })
        : supabase
            .from("fieldops_assignment")
            .select(ASSIGNMENT_COLUMNS)
            .eq("campaign_id", membership.campaignId)
            .eq("member_user_id", userId)
            .lte("starts_on", today)
            .gte("ends_on", today)
            .neq("status", "cancelled")
            .order("starts_on"),
      supabase
        .from("fieldops_assignment")
        .select("status")
        .eq("campaign_id", membership.campaignId)
        .eq("member_user_id", userId),
      supabase
        .from("fieldops_prospect")
        .select("status")
        .eq("campaign_id", membership.campaignId)
        .eq("member_user_id", userId),
    ]);
  if (!campaign) return { status: 404, message: "Campaign not found" };

  const rank: Record<string, number> = {
    started: 0,
    assigned: 1,
    completed: 2,
  };
  const todayAssignments = (
    await mapAssignments(supabase, (todayRows ?? []) as AssignmentRow[])
  ).sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));

  let openAssignments = 0;
  let completedAssignments = 0;
  for (const a of allAssignments ?? []) {
    if (a.status === "assigned" || a.status === "started") openAssignments++;
    if (a.status === "completed") completedAssignments++;
  }
  const prospectRows = prospects.data ?? [];

  return {
    status: 200,
    data: {
      programEnabled: true,
      memberships: ctx.memberships,
      current: {
        membership,
        campaign,
        isLead,
        todayAssignments,
        stats: {
          openAssignments,
          completedAssignments,
          prospects: prospectRows.length,
          prospectsContacted: prospectRows.filter(
            (p) => p.status !== "identified",
          ).length,
        },
        today,
      },
    },
  };
}
