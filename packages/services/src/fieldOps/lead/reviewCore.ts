import type {
  FieldOpsOnboarding,
  FieldOpsOnboardingStatus,
  FieldOpsReviewDecision,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { recordPendingCommission } from "../shared/commissionRows";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import {
  type FieldOpsEnvelope,
  dbErr,
  notifyFieldOps,
} from "../shared/fieldOpsRows";
import {
  ONBOARDING_COLUMNS,
  type OnboardingRow,
  liveRuleFor,
  mapOnboarding,
  readProgramSettings,
} from "../shared/onboardingRows";

// The team lead's review: the queue of submitted onboardings and the
// decision (verified / needs changes / rejected). Verification snapshots
// the rule in force and starts the holding period; the sweep (Phase 3)
// re-checks everything before any money moves. The lead's decision is
// necessary, never sufficient.

const REVIEWING_STATUSES = new Set([
  "active",
  "paused",
  "winding_down",
  "completed",
]);

export async function listReviewQueueCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; status?: FieldOpsOnboardingStatus },
): Promise<FieldOpsEnvelope<FieldOpsOnboarding[]>> {
  let teamId: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    teamId = requireMembership(ctx, input.campaignId, ["team_lead"]).teamId;
  } catch (e) {
    return fieldOpsError(e);
  }
  let q = supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("team_id", teamId)
    .neq("status", "draft")
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .limit(300);
  if (input.status) q = q.eq("status", input.status);
  const { data, error } = await q;
  if (error) return dbErr(error, "Could not load the review queue");
  const rows = (data ?? []) as unknown as OnboardingRow[];
  // Waiting on the lead first, then the rest newest-first.
  const rank = (s: string) => (s === "submitted" ? 0 : 1);
  rows.sort(
    (a, b) =>
      rank(a.status) - rank(b.status) || (b.updated_at > a.updated_at ? 1 : -1),
  );
  return { status: 200, data: rows.map((r) => mapOnboarding(r)) };
}

export type ReviewInput = {
  campaignId: string;
  onboardingId: string;
  decision: FieldOpsReviewDecision;
  note?: string | null;
};

export async function reviewOnboardingCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: ReviewInput,
): Promise<FieldOpsEnvelope<FieldOpsOnboarding>> {
  let teamId: string;
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId, ["team_lead"]);
    teamId = m.teamId;
    campaignStatus = m.campaignStatus;
  } catch (e) {
    return fieldOpsError(e);
  }
  if (!REVIEWING_STATUSES.has(campaignStatus)) {
    return { status: 409, message: "The campaign is closed." };
  }
  const { data } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", input.onboardingId)
    .eq("campaign_id", input.campaignId)
    .eq("team_id", teamId)
    .maybeSingle();
  const row = data as unknown as OnboardingRow | null;
  if (!row) return { status: 404, message: "Onboarding not found" };
  if (row.status !== "submitted") {
    return {
      status: 409,
      message: "This onboarding isn't waiting for review.",
    };
  }
  if (row.member_user_id === userId) {
    return { status: 403, message: "You can't review your own onboarding." };
  }
  if (
    input.decision !== "verified" &&
    !(input.note && input.note.trim().length >= 3)
  ) {
    return {
      status: 400,
      message: "Tell the member what to change, or why it was rejected.",
    };
  }

  if (input.decision === "verified") {
    const activityKey =
      row.activity_key ??
      (row.mode === "offline"
        ? "place_onboarding_offline"
        : "place_onboarding_online");
    const [rule, settings, { data: campaign }] = await Promise.all([
      liveRuleFor(supabase, row.campaign_id, activityKey),
      readProgramSettings(supabase),
      supabase
        .from("fieldops_campaign")
        .select("holding_days_override")
        .eq("id", row.campaign_id)
        .maybeSingle(),
    ]);
    const holdingDays =
      campaign?.holding_days_override ??
      rule?.eligibility.holding_days ??
      Number(settings.default_holding_days);
    const holdingUntil = new Date(
      Date.now() + holdingDays * 86_400_000,
    ).toISOString();
    const { error } = await supabase
      .from("fieldops_onboarding")
      .update({
        rule_id: rule?.id ?? null,
        holding_until: holdingUntil,
      } as never)
      .eq("id", row.id)
      .eq("status", "submitted");
    if (error) return dbErr(error, "Could not record the verification");
  }

  const { error: trErr } = await supabase.rpc(
    "fieldops_transition_onboarding",
    {
      p_onboarding_id: row.id,
      p_to: input.decision,
      p_actor: userId,
      p_actor_kind: "lead",
      p_note: input.note ?? undefined,
      p_details: {},
    },
  );
  if (trErr) {
    return trErr.code === "23514"
      ? { status: 409, message: trErr.message }
      : dbErr(trErr, "Could not save the decision");
  }

  // Verification earns a PENDING commission at the rule's amount. It only
  // becomes payable once the sweep re-checks everything after the holding
  // period — the lead's decision never moves money on its own.
  if (input.decision === "verified") {
    await recordPendingCommission(supabase, row.id);
  }

  const titles: Record<FieldOpsReviewDecision, string> = {
    verified: `Verified: ${row.business_name ?? "your onboarding"}`,
    needs_changes: `Changes needed: ${row.business_name ?? "your onboarding"}`,
    rejected: `Not accepted: ${row.business_name ?? "your onboarding"}`,
  };
  await notifyFieldOps(supabase, [row.member_user_id], {
    type: "fieldops_submission_reviewed",
    title: titles[input.decision],
    body:
      input.decision === "verified"
        ? "Your team lead verified it. The commission is confirmed after the holding period."
        : (input.note ?? null),
    route: `/field/submissions/${row.id}`,
  });

  const { data: fresh } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", row.id)
    .maybeSingle();
  return {
    status: 200,
    message:
      input.decision === "verified"
        ? "Verified. The holding period has started."
        : input.decision === "needs_changes"
          ? "Returned to the member."
          : "Rejected.",
    data: mapOnboarding((fresh ?? row) as unknown as OnboardingRow),
  };
}
