import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  FieldOpsFlaggedOnboarding,
  FieldOpsOnboarding,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  COMMISSION_COLUMNS,
  type CommissionRow,
  mapCommission,
} from "../../fieldOps/shared/commissionRows";
import {
  ONBOARDING_COLUMNS,
  type OnboardingRow,
  mapOnboarding,
} from "../../fieldOps/shared/onboardingRows";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import { type RequestMeta, dbError, denied } from "./fieldOpsAdminShared";

// Admin > Field Ops > Review queue: everything the eligibility sweep could
// not decide on its own — a soft check that failed, a routine spot check, or
// an onboarding verified while no rule was live. An admin's decision here is
// the only other way (besides the sweep) a commission becomes payable.

export async function listFlagQueueAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: { campaignId?: string; cursor?: string },
): Promise<
  AdminEnvelope<{
    items: (FieldOpsFlaggedOnboarding & { campaignName: string })[];
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
    .select(`${ONBOARDING_COLUMNS}, flag_details, fieldops_campaign(name)`)
    .eq("status", "flagged")
    .order("updated_at", { ascending: true })
    .limit(PAGE + 1);
  if (filters.campaignId) q = q.eq("campaign_id", filters.campaignId);
  if (filters.cursor) q = q.gt("updated_at", filters.cursor);
  const { data, error } = await q;
  if (error) return dbError(error, "Could not load the review queue");

  const rows = (data ?? []) as unknown as (OnboardingRow & {
    fieldops_campaign: { name: string } | null;
  })[];
  const page = rows.slice(0, PAGE);

  const ids = page.map((r) => r.id);
  const commissions = new Map<string, CommissionRow>();
  if (ids.length > 0) {
    const { data: cs } = await supabase
      .from("fieldops_commission")
      .select(COMMISSION_COLUMNS)
      .in("onboarding_id", ids)
      .is("reverses_commission_id", null);
    for (const c of (cs ?? []) as unknown as CommissionRow[]) {
      if (c.onboarding_id) commissions.set(c.onboarding_id, c);
    }
  }

  return {
    status: 200,
    data: {
      items: page.map((r) => {
        const c = commissions.get(r.id);
        return {
          onboarding: mapOnboarding(r),
          commission: c ? mapCommission(c) : null,
          flags: r.flags ?? [],
          flagDetails: (r.flag_details ?? {}) as Record<string, unknown>,
          campaignName: r.fieldops_campaign?.name ?? "",
        };
      }),
      nextCursor:
        rows.length > PAGE ? (page[page.length - 1]?.updated_at ?? null) : null,
    },
  };
}

/**
 * Resolves one flag. `succeeded` approves the pending commission with the
 * admin recorded as the approver; `rejected` rejects both. The SQL function
 * refuses an admin who also verified the row.
 */
export async function decideFlagAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    onboardingId: string;
    decision: "succeeded" | "rejected";
    note?: string | null;
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
  if (row.status !== "flagged") {
    return { status: 409, message: "This onboarding is not flagged." };
  }

  const { error } = await supabase.rpc("fieldops_decide_flag", {
    p_onboarding_id: input.onboardingId,
    p_admin: ctx.userId,
    p_decision: input.decision,
    p_note: input.note ?? undefined,
  });
  if (error) return dbError(error, "Could not record the decision");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: `fieldops.flag.${input.decision}`,
    targetType: "fieldops_onboarding",
    targetId: row.id,
    summary: `${row.business_name ?? row.id}: flagged → ${input.decision}`,
    reason: input.note ?? "",
    before: { status: "flagged", flags: row.flags ?? [] },
    after: { status: input.decision },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  const { data: fresh } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", row.id)
    .maybeSingle();
  return {
    status: 200,
    message:
      input.decision === "succeeded"
        ? "Approved. The commission is ready to pay."
        : "Rejected.",
    data: mapOnboarding((fresh ?? row) as unknown as OnboardingRow),
  };
}
