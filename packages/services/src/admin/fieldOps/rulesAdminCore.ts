import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  FieldOpsActivityKey,
  FieldOpsCommissionRule,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import {
  type RequestMeta,
  type RuleRow,
  dbError,
  denied,
  mapRules,
  num,
} from "./fieldOpsAdminShared";

// Commission rules (Admin > Field Ops > Rules). Versions are never edited:
// a change publishes a new, inactive version; making it live is a separate
// audited step, and a version that pays MORE than the live one must be
// activated by a different admin from the one who published it (the same
// second-approver rule the Rewards module uses for cost increases).

// Activities whose engine exists. Making any other rule live would record
// a promise nothing pays out, so it's refused. Content and the two stipends
// are still Phase 6.
const SHIPPED_ACTIVITIES = new Set<FieldOpsActivityKey>([
  "place_onboarding_offline",
  "place_onboarding_online",
  "event_onboarding_offline",
  "event_onboarding_online",
  "existing_place_claim_assist",
]);

export async function listCommissionRulesCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  campaignId?: string | null,
): Promise<AdminEnvelope<FieldOpsCommissionRule[]>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  let q = supabase
    .from("fieldops_commission_rule")
    .select("*")
    .order("activity_key")
    .order("version", { ascending: false });
  q = campaignId
    ? q.or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
    : q.is("campaign_id", null);
  const { data, error } = await q;
  if (error) return dbError(error, "Could not load the rules");
  return {
    status: 200,
    data: await mapRules(supabase, (data ?? []) as unknown as RuleRow[]),
  };
}

export type RuleVersionInput = {
  campaignId: string | null;
  activityKey: FieldOpsActivityKey;
  amountMinor: number;
  currency: string;
  eligibility: Record<string, unknown>;
  note: string;
  reason: string;
};

export async function publishCommissionRuleVersionCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: RuleVersionInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ id: string; version: number }>> {
  try {
    assertPermission(ctx, "fieldops.rules");
  } catch (e) {
    return denied(e);
  }
  if (input.campaignId) {
    const { data: campaign } = await supabase
      .from("fieldops_campaign")
      .select("id, status, currency")
      .eq("id", input.campaignId)
      .maybeSingle();
    if (!campaign) return { status: 404, message: "Campaign not found" };
    if (campaign.status === "archived") {
      return { status: 409, message: "An archived campaign is read-only." };
    }
    if (campaign.currency !== input.currency) {
      return {
        status: 400,
        message: `This campaign pays in ${campaign.currency}; the rule must use the same currency.`,
      };
    }
  }

  let q = supabase
    .from("fieldops_commission_rule")
    .select("version, eligibility")
    .eq("activity_key", input.activityKey)
    .order("version", { ascending: false })
    .limit(1);
  q = input.campaignId
    ? q.eq("campaign_id", input.campaignId)
    : q.is("campaign_id", null);
  const { data: latest } = await q.maybeSingle();
  const version = (latest?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from("fieldops_commission_rule")
    .insert({
      campaign_id: input.campaignId,
      activity_key: input.activityKey,
      version,
      is_active: false,
      amount_minor: input.amountMinor,
      currency: input.currency,
      eligibility: input.eligibility,
      note: input.note,
      created_by: ctx.userId,
    } as never)
    .select("id, version")
    .single();
  if (error || !data) {
    return dbError(
      error ?? { message: "insert failed" },
      "Could not publish the rule version",
    );
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.rule.publish",
    targetType: "fieldops_commission_rule",
    targetId: data.id,
    summary: `${input.activityKey} v${data.version} published (inactive)${input.campaignId ? " for one campaign" : ""}`,
    reason: input.reason,
    before: { version: latest?.version ?? null },
    after: { ...input, version: data.version },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: `Version ${data.version} published. It isn't live until someone activates it.`,
    data: { id: data.id, version: data.version },
  };
}

/** Whether making `target` live could pay more than what's live now. */
export function ruleRaisesCost(
  target: { amount_minor: number | string; eligibility: unknown },
  current: { amount_minor: number | string; eligibility: unknown } | null,
): boolean {
  if (!current) return true;
  if (num(target.amount_minor) > num(current.amount_minor)) return true;
  const t = (target.eligibility ?? {}) as Record<string, unknown>;
  const c = (current.eligibility ?? {}) as Record<string, unknown>;
  // A shorter holding period or fewer required checks pays sooner / easier.
  if (num(t.holding_days) < num(c.holding_days)) return true;
  if (num(t.min_photos) < num(c.min_photos)) return true;
  for (const key of [
    "require_owner_phone_verified",
    "require_inside_territory",
    "require_opening_hours",
    "require_contact",
  ]) {
    if (c[key] === true && t[key] !== true) return true;
  }
  return false;
}

export async function setCommissionRuleActiveCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    campaignId: string | null;
    activityKey: FieldOpsActivityKey;
    ruleId: string | null;
    reason: string;
  },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ activeRuleId: string | null }>> {
  try {
    assertPermission(ctx, "fieldops.rules");
  } catch (e) {
    return denied(e);
  }
  if (input.ruleId && !SHIPPED_ACTIVITIES.has(input.activityKey)) {
    return {
      status: 409,
      message:
        "The part of the programme that pays this activity hasn't shipped yet, so the rule can't be made live.",
    };
  }

  let q = supabase
    .from("fieldops_commission_rule")
    .select("id, version, is_active, amount_minor, eligibility, created_by")
    .eq("activity_key", input.activityKey);
  q = input.campaignId
    ? q.eq("campaign_id", input.campaignId)
    : q.is("campaign_id", null);
  const { data: versions, error: readError } = await q;
  if (readError) return dbError(readError, "Could not read the rule");

  const current = (versions ?? []).find((v) => v.is_active) ?? null;
  const target = input.ruleId
    ? ((versions ?? []).find((v) => v.id === input.ruleId) ?? null)
    : null;
  if (input.ruleId && !target)
    return { status: 404, message: "Rule version not found" };
  if (current?.id === target?.id)
    return { status: 400, message: "Nothing changed." };

  if (
    target &&
    target.created_by === ctx.userId &&
    ruleRaisesCost(target, current)
  ) {
    return {
      status: 409,
      message:
        "This version could pay out more than what's live now, so another admin has to activate it.",
    };
  }

  const { error } = await supabase.rpc("fieldops_commission_rule_set_active", {
    p_campaign_id: input.campaignId as string,
    p_activity_key: input.activityKey,
    p_rule_id: input.ruleId as string,
  });
  if (error) return dbError(error, "Could not change the live version");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: target ? "fieldops.rule.activate" : "fieldops.rule.deactivate",
    targetType: "fieldops_commission_rule",
    targetId: target?.id ?? current?.id ?? input.activityKey,
    summary: target
      ? `${input.activityKey} v${target.version} is now live${current ? ` (was v${current.version})` : ""}`
      : `${input.activityKey} switched off${current ? ` (was v${current.version})` : ""}`,
    reason: input.reason,
    before: { activeVersion: current?.version ?? null },
    after: { activeVersion: target?.version ?? null },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: target
      ? `Version ${target.version} is now live.`
      : "The rule is switched off.",
    data: { activeRuleId: target?.id ?? null },
  };
}
