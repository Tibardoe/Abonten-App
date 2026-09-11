import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  FieldOpsOnboarding,
  FieldOpsOnboardingDetail,
  FieldOpsOnboardingStatus,
  FieldOpsReviewDecision,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { recordPendingCommission } from "../../fieldOps/shared/commissionRows";
import { notifyFieldOps } from "../../fieldOps/shared/fieldOpsRows";
import {
  ONBOARDING_COLUMNS,
  type OnboardingRow,
  buildOnboardingDetail,
  mapOnboarding,
} from "../../fieldOps/shared/onboardingRows";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import { type RequestMeta, dbError, denied } from "./fieldOpsAdminShared";

// Admin > Field Ops > Onboardings: every onboarding across campaigns, the
// full detail (evidence, timeline, checklist), and the override of a
// team lead's decision (fieldops.verify). The owner's phone is shown in
// full only with users.view_pii.

export type ListOnboardingsFilters = {
  campaignId?: string;
  status?: FieldOpsOnboardingStatus;
  cursor?: string;
};

export async function listOnboardingsAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: ListOnboardingsFilters,
): Promise<
  AdminEnvelope<{
    items: (FieldOpsOnboarding & { campaignName: string })[];
    nextCursor: string | null;
  }>
> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const PAGE = 50;
  let q = supabase
    .from("fieldops_onboarding")
    .select(`${ONBOARDING_COLUMNS}, fieldops_campaign(name)`)
    .order("updated_at", { ascending: false })
    .limit(PAGE + 1);
  if (filters.campaignId) q = q.eq("campaign_id", filters.campaignId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.cursor) q = q.lt("updated_at", filters.cursor);
  const { data, error } = await q;
  if (error) return dbError(error, "Could not load onboardings");
  const rows = (data ?? []) as unknown as (OnboardingRow & {
    fieldops_campaign: { name: string } | null;
  })[];
  const page = rows.slice(0, PAGE);
  return {
    status: 200,
    data: {
      items: page.map((r) => ({
        ...mapOnboarding(r),
        campaignName: r.fieldops_campaign?.name ?? "",
      })),
      nextCursor:
        rows.length > PAGE ? (page[page.length - 1]?.updated_at ?? null) : null,
    },
  };
}

export async function getOnboardingAdminDetailCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  onboardingId: string,
): Promise<AdminEnvelope<FieldOpsOnboardingDetail & { campaignName: string }>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase
    .from("fieldops_onboarding")
    .select(`${ONBOARDING_COLUMNS}, fieldops_campaign(name)`)
    .eq("id", onboardingId)
    .maybeSingle();
  if (error) return dbError(error, "Could not load the onboarding");
  if (!data) return { status: 404, message: "Onboarding not found" };
  const row = data as unknown as OnboardingRow & {
    fieldops_campaign: { name: string } | null;
  };
  const detail = await buildOnboardingDetail(supabase, row, {
    revealOwnerPhone: ctx.permissions.includes("users.view_pii"),
  });
  return {
    status: 200,
    data: { ...detail, campaignName: row.fieldops_campaign?.name ?? "" },
  };
}

/**
 * An admin decides a submitted onboarding in the lead's place (or
 * overrides a lead who hasn't decided). Same transition rules as the
 * lead's review, recorded as an override + audited.
 */
export async function decideOnboardingAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    onboardingId: string;
    decision: FieldOpsReviewDecision;
    note: string;
    reason: string;
  },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<FieldOpsOnboarding>> {
  try {
    assertPermission(ctx, "fieldops.verify");
  } catch (e) {
    return denied(e);
  }
  const { data } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", input.onboardingId)
    .maybeSingle();
  const row = data as unknown as OnboardingRow | null;
  if (!row) return { status: 404, message: "Onboarding not found" };
  if (row.status !== "submitted") {
    return {
      status: 409,
      message: "Only a submitted onboarding can be decided here.",
    };
  }
  if (input.decision === "verified") {
    const { data: settings } = await supabase
      .from("fieldops_program_setting")
      .select("default_holding_days")
      .eq("id", 1)
      .maybeSingle();
    const days = Number(settings?.default_holding_days ?? 7);
    await supabase
      .from("fieldops_onboarding")
      .update({
        holding_until: new Date(Date.now() + days * 86_400_000).toISOString(),
      } as never)
      .eq("id", row.id);
  }
  await supabase
    .from("fieldops_onboarding")
    .update({
      overridden_by: ctx.userId,
      overridden_at: new Date().toISOString(),
      override_note: input.note,
    } as never)
    .eq("id", row.id);
  const { error } = await supabase.rpc("fieldops_transition_onboarding", {
    p_onboarding_id: row.id,
    p_to: input.decision,
    p_actor: ctx.userId,
    p_actor_kind: "admin",
    p_note: input.note,
    p_details: { reason: input.reason },
  });
  if (error) return dbError(error, "Could not record the decision");

  // Same as a lead's verification: the pending commission is recorded now,
  // and only the sweep can make it payable.
  if (input.decision === "verified") {
    await recordPendingCommission(supabase, row.id);
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: `fieldops.onboarding.${input.decision}`,
    targetType: "fieldops_onboarding",
    targetId: row.id,
    summary: `${row.business_name ?? row.id}: submitted → ${input.decision} (admin)`,
    reason: input.reason,
    before: { status: row.status },
    after: { status: input.decision, note: input.note },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  await notifyFieldOps(supabase, [row.member_user_id], {
    type: "fieldops_submission_reviewed",
    title:
      input.decision === "verified"
        ? `Verified: ${row.business_name ?? "your onboarding"}`
        : input.decision === "needs_changes"
          ? `Changes needed: ${row.business_name ?? "your onboarding"}`
          : `Not accepted: ${row.business_name ?? "your onboarding"}`,
    body: input.note,
    route: `/field/submissions/${row.id}`,
  });
  const { data: fresh } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", row.id)
    .maybeSingle();
  return {
    status: 200,
    message: "Decision recorded.",
    data: mapOnboarding((fresh ?? row) as unknown as OnboardingRow),
  };
}
