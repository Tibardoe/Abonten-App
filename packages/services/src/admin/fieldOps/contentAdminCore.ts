import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  FieldOpsContentBrief,
  FieldOpsContentSubmission,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  BRIEF_COLUMNS,
  type BriefRow,
  CONTENT_SUBMISSION_COLUMNS,
  type ContentSubmissionRow,
  mapBrief,
  mapContentSubmission,
} from "../../fieldOps/shared/contentRows";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import { type RequestMeta, dbError, denied, num } from "./fieldOpsAdminShared";

// Admin > Field Ops > Content: every brief and deliverable across
// campaigns, the same approve/reject a lead has (so a stuck review can be
// unblocked), and the monthly stipend run.
//
// The engagement numbers travel with the row but are never used to decide
// anything — they are the creator's own report of what a platform showed
// them, and the UI says so.

export async function listContentAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: { campaignId?: string; status?: string },
): Promise<
  AdminEnvelope<{
    briefs: (FieldOpsContentBrief & { campaignName: string })[];
    submissions: (FieldOpsContentSubmission & { campaignName: string })[];
  }>
> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  let bq = supabase
    .from("fieldops_content_brief")
    .select(`${BRIEF_COLUMNS}, fieldops_campaign(name)`)
    .order("created_at", { ascending: false })
    .limit(200);
  let sq = supabase
    .from("fieldops_content_submission")
    .select(`${CONTENT_SUBMISSION_COLUMNS}, fieldops_campaign(name)`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.campaignId) {
    bq = bq.eq("campaign_id", filters.campaignId);
    sq = sq.eq("campaign_id", filters.campaignId);
  }
  if (filters.status) sq = sq.eq("status", filters.status);

  const [{ data: briefs }, { data: subs, error }] = await Promise.all([bq, sq]);
  if (error) return dbError(error, "Could not load content");

  return {
    status: 200,
    data: {
      briefs: (
        (briefs ?? []) as unknown as (BriefRow & {
          fieldops_campaign: { name: string } | null;
        })[]
      ).map((r) => ({
        ...mapBrief(r),
        campaignName: r.fieldops_campaign?.name ?? "",
      })),
      submissions: (
        (subs ?? []) as unknown as (ContentSubmissionRow & {
          fieldops_campaign: { name: string } | null;
        })[]
      ).map((r) => ({
        ...mapContentSubmission(r),
        campaignName: r.fieldops_campaign?.name ?? "",
      })),
    },
  };
}

export async function reviewContentAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    submissionId: string;
    decision: "approved" | "rejected";
    note?: string | null;
  },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<FieldOpsContentSubmission>> {
  try {
    assertPermission(ctx, "fieldops.verify");
  } catch (e) {
    return denied(e);
  }
  const { data: before } = await supabase
    .from("fieldops_content_submission")
    .select("id, status, url, member_user_id")
    .eq("id", input.submissionId)
    .maybeSingle();
  if (!before) return { status: 404, message: "Deliverable not found" };
  if (before.status !== "submitted") {
    return {
      status: 409,
      message: "This deliverable has already been decided.",
    };
  }

  const { error } = await supabase.rpc("fieldops_review_content", {
    p_submission_id: input.submissionId,
    p_reviewer: ctx.userId,
    p_decision: input.decision,
    p_note: input.note ?? undefined,
  });
  if (error) return dbError(error, "Could not record the decision");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: `fieldops.content.${input.decision}`,
    targetType: "fieldops_content_submission",
    targetId: input.submissionId,
    summary: `${before.url}: submitted → ${input.decision}`,
    reason: input.note ?? "",
    before: { status: before.status },
    after: { status: input.decision },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  const { data: fresh } = await supabase
    .from("fieldops_content_submission")
    .select(CONTENT_SUBMISSION_COLUMNS)
    .eq("id", input.submissionId)
    .maybeSingle();
  return {
    status: 200,
    message:
      input.decision === "approved"
        ? "Approved. The commission is confirmed after the holding period."
        : "Rejected.",
    data: mapContentSubmission(fresh as unknown as ContentSubmissionRow),
  };
}

/**
 * Authorises one month of stipends for a campaign. A stipend is not earned
 * per item — it is a payroll line for being on the team that month — so an
 * admin signs it off and it is approved on the spot, with the admin
 * recorded as the approver. Idempotent per member per month, so running it
 * twice pays nobody twice.
 */
export async function runMonthlyStipendsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { campaignId: string; periodStart: string; reason: string },
  requestMeta?: RequestMeta,
): Promise<
  AdminEnvelope<{ period: string; created: number; totalMinor: number }>
> {
  try {
    assertPermission(ctx, "fieldops.commissions.approve");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase.rpc("fieldops_run_monthly_stipends", {
    p_campaign_id: input.campaignId,
    p_period_start: input.periodStart,
    p_admin: ctx.userId,
  });
  if (error) return dbError(error, "Could not run the stipends");
  const res = (data ?? {}) as {
    period?: string;
    created?: number;
    total_minor?: number;
  };

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.stipends.run",
    targetType: "fieldops_campaign",
    targetId: input.campaignId,
    summary: `Stipends for ${res.period}: ${num(res.created)} added`,
    reason: input.reason,
    before: {},
    after: { created: num(res.created), totalMinor: num(res.total_minor) },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message:
      num(res.created) === 0
        ? "Nothing to add: either the stipend rules are off, or that month is already paid."
        : `${num(res.created)} stipend(s) added for ${res.period}.`,
    data: {
      period: res.period ?? input.periodStart,
      created: num(res.created),
      totalMinor: num(res.total_minor),
    },
  };
}
