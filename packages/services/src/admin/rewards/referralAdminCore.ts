import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type {
  AdminReferralSummary,
  AdminRewardEvent,
  RewardEventStatus,
  RewardRuleSummary,
} from "@abonten/types/rewards";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import { dbError, displayName, namesFor, readRules } from "./rewardsAdminCore";

// Admin side of the reward engine (Phase 4): the shadow-mode projection,
// the list of reward decisions, the review queue for held rewards, and rule
// versions. Same contract as rewardsAdminCore: service-role client + a
// resolved AdminContext, permission re-checked here, every change audited.

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const denied = (e: unknown): AdminEnvelope<never> =>
  adminError(e) as AdminEnvelope<never>;

type RequestMeta = Record<string, unknown> | undefined;

type RewardEventRow = {
  id: string;
  rule_key: string;
  rule_version: number | null;
  is_shadow: boolean;
  status: RewardEventStatus;
  decision: "auto" | "review" | "reject";
  status_reason: string | null;
  amount_minor: number;
  released_minor: number | null;
  risk_score: number;
  risk_flags: string[];
  basis: Record<string, unknown>;
  beneficiary_user_id: string;
  buyer_user_id: string | null;
  event_id: string | null;
  transaction_id: string | null;
  release_at: string | null;
  created_at: string;
  settled_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

const EVENT_COLUMNS =
  "id, rule_key, rule_version, is_shadow, status, decision, status_reason, amount_minor, released_minor, risk_score, risk_flags, basis, beneficiary_user_id, buyer_user_id, event_id, transaction_id, release_at, created_at, settled_at, reviewed_by, reviewed_at, review_note";

async function mapEvents(
  supabase: ServiceRoleClient,
  rows: RewardEventRow[],
): Promise<AdminRewardEvent[]> {
  const names = await namesFor(
    supabase,
    rows.flatMap((r) => [
      r.beneficiary_user_id,
      r.buyer_user_id,
      r.reviewed_by,
    ]),
  );
  const eventIds = [...new Set(rows.map((r) => r.event_id).filter(Boolean))];
  const titles = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data } = await supabase
      .from("event")
      .select("id, title")
      .in("id", eventIds as string[]);
    for (const e of data ?? []) titles.set(e.id, e.title);
  }
  return rows.map((r) => ({
    id: r.id,
    ruleKey: r.rule_key,
    ruleVersion: r.rule_version,
    isShadow: r.is_shadow,
    status: r.status,
    decision: r.decision,
    statusReason: r.status_reason,
    amountMinor: num(r.amount_minor),
    releasedMinor: r.released_minor === null ? null : num(r.released_minor),
    riskScore: r.risk_score,
    riskFlags: r.risk_flags ?? [],
    basis: r.basis ?? {},
    beneficiary: {
      id: r.beneficiary_user_id,
      name: displayName(names.get(r.beneficiary_user_id)),
    },
    buyer: {
      id: r.buyer_user_id,
      name: r.buyer_user_id ? displayName(names.get(r.buyer_user_id)) : null,
    },
    event: {
      id: r.event_id,
      title: r.event_id ? (titles.get(r.event_id) ?? null) : null,
    },
    transactionId: r.transaction_id,
    releaseAt: r.release_at,
    createdAt: r.created_at,
    settledAt: r.settled_at,
    review: {
      by: r.reviewed_by ? displayName(names.get(r.reviewed_by)) : null,
      at: r.reviewed_at,
      note: r.review_note,
    },
  }));
}

export async function listRewardEventsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: {
    status?: RewardEventStatus;
    mode?: "shadow" | "live";
    beneficiaryId?: string;
    ruleKeys?: string[];
    cursor?: string | null;
    pageSize?: number;
  } = {},
): Promise<PaginatedResult<AdminRewardEvent>> {
  const empty = (status: number, message: string) => ({
    status,
    data: [],
    nextCursor: null,
    hasNextPage: false,
    message,
  });
  try {
    assertPermission(ctx, "rewards.view");
  } catch (e) {
    return empty(403, (e as Error).message);
  }

  const pageSize = filters.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  let query = supabase
    .from("reward_event")
    .select(EVENT_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.mode) query = query.eq("is_shadow", filters.mode === "shadow");
  if (filters.beneficiaryId) {
    query = query.eq("beneficiary_user_id", filters.beneficiaryId);
  }
  if (filters.ruleKeys && filters.ruleKeys.length > 0) {
    query = query.in("rule_key", filters.ruleKeys);
  }
  if (cursor) query = query.or(keysetOlderThan("created_at", "id", cursor));

  const { data, error } = await query;
  if (error) {
    logger.error(`listRewardEventsCore failed: ${error.message}`);
    return empty(500, "Something went wrong");
  }

  const { page, hasNextPage } = splitPage(
    (data ?? []) as unknown as RewardEventRow[],
    pageSize,
  );
  const last = page[page.length - 1];
  return {
    status: 200,
    data: await mapEvents(supabase, page),
    nextCursor:
      hasNextPage && last
        ? encodeCursor<SimpleCursor>({
            sortValue: last.created_at,
            id: last.id,
          })
        : null,
    hasNextPage,
  };
}

/**
 * What the engine decided over the last `sinceDays`, for tuning rates before
 * shadow mode is switched off. Aggregated in memory: fine for the volumes
 * shadow mode sees; move to the daily rollup when volume grows.
 */
export async function getReferralSummaryCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  sinceDays = 30,
): Promise<AdminEnvelope<AdminReferralSummary>> {
  try {
    assertPermission(ctx, "rewards.view");
  } catch (e) {
    return denied(e);
  }

  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const [touches, checkouts, events, health, binds] = await Promise.all([
    supabase
      .from("referral_touch")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    supabase
      .from("ticket_checkout")
      .select("id", { count: "exact", head: true })
      .not("referrer_user_id", "is", null)
      .eq("status", "paid")
      .gte("completed_at", since),
    supabase
      .from("reward_event")
      .select(
        "rule_key, status, amount_minor, released_minor, risk_flags, basis, beneficiary_user_id",
      )
      .gte("created_at", since)
      .limit(10_000),
    supabase.rpc("rewards_health"),
    supabase
      .from("user_referral")
      .select("referee_user_id", { count: "exact", head: true })
      .gte("bound_at", since),
  ]);

  if (events.error || health.error) {
    logger.error(
      `getReferralSummaryCore failed: ${events.error?.message ?? health.error?.message}`,
    );
    return { status: 500, message: "Something went wrong" };
  }

  const byStatus: AdminReferralSummary["byStatus"] = {};
  const friend: AdminReferralSummary["friend"] = {
    joined: binds.count ?? 0,
    byStatus: {},
    byPath: {},
    welcome: { granted: 0, amountMinor: 0, rejected: 0 },
  };
  const flagCounts = new Map<string, number>();
  const referrers = new Map<string, { rewards: number; amountMinor: number }>();
  let revenue = 0;
  let net = 0;
  let projected = 0;

  for (const row of events.data ?? []) {
    const status = row.status as RewardEventStatus;
    const amount =
      status === "released" ? num(row.released_minor) : num(row.amount_minor);
    for (const flag of (row.risk_flags as string[] | null) ?? []) {
      flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
    }

    if (row.rule_key === "friend_referral_referee") {
      if (status === "released") {
        friend.welcome.granted += 1;
        friend.welcome.amountMinor += amount;
      } else if (status === "rejected") {
        friend.welcome.rejected += 1;
      }
      continue;
    }
    if (row.rule_key === "friend_referral_referrer") {
      const bucket = friend.byStatus[status] ?? { count: 0, amountMinor: 0 };
      bucket.count += 1;
      bucket.amountMinor += amount;
      friend.byStatus[status] = bucket;
      const path = (row.basis as Record<string, unknown> | null)?.path;
      if (
        status !== "rejected" &&
        (path === "first_order" ||
          path === "organizer_sales" ||
          path === "place_claim")
      ) {
        friend.byPath[path] = (friend.byPath[path] ?? 0) + 1;
      }
      continue;
    }
    if (row.rule_key !== "event_referral") continue;

    const bucket = byStatus[status] ?? { count: 0, amountMinor: 0 };
    bucket.count += 1;
    bucket.amountMinor += amount;
    byStatus[status] = bucket;

    const basis = (row.basis ?? {}) as Record<string, unknown>;
    if (status !== "rejected") {
      revenue += num(basis.ticket_revenue_minor);
      net += num(basis.net_revenue_share_minor);
    }
    if (status === "pending" || status === "held" || status === "released") {
      projected += amount;
      const r = referrers.get(row.beneficiary_user_id) ?? {
        rewards: 0,
        amountMinor: 0,
      };
      r.rewards += 1;
      r.amountMinor += amount;
      referrers.set(row.beneficiary_user_id, r);
    }
  }

  const top = [...referrers.entries()]
    .sort(([, a], [, b]) => b.amountMinor - a.amountMinor)
    .slice(0, 10);
  const names = await namesFor(
    supabase,
    top.map(([id]) => id),
  );
  const h = (health.data ?? {}) as Record<string, number>;

  return {
    status: 200,
    data: {
      sinceDays,
      touches: touches.count ?? 0,
      attributedCheckouts: checkouts.count ?? 0,
      referredTicketRevenueMinor: revenue,
      referredNetRevenueMinor: net,
      byStatus,
      projectedCostShareBps:
        net > 0 ? Math.round((projected * 10000) / net) : null,
      riskFlags: [...flagCounts.entries()]
        .map(([flag, count]) => ({ flag, count }))
        .sort((a, b) => b.count - a.count),
      topReferrers: top.map(([userId, r]) => ({
        userId,
        name: displayName(names.get(userId)),
        rewards: r.rewards,
        amountMinor: r.amountMinor,
      })),
      engine: {
        outboxLagSeconds: num(h.outbox_lag_seconds),
        deadLetters: num(h.outbox_dead_letters),
        settlementBacklog: num(h.settlement_backlog),
      },
      friend,
    },
  };
}

/** Approve (release when due) or reject a reward held for review. */
export async function decideHeldRewardCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { rewardEventId: string; approve: boolean; note: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ status: string }>> {
  try {
    assertPermission(ctx, "rewards.review");
  } catch (e) {
    return denied(e);
  }

  const { data: before } = await supabase
    .from("reward_event")
    .select(
      "status, status_reason, amount_minor, beneficiary_user_id, is_shadow",
    )
    .eq("id", input.rewardEventId)
    .maybeSingle();

  const { data, error } = await supabase.rpc("reward_review_decision", {
    p_reward_event_id: input.rewardEventId,
    p_admin_id: ctx.userId,
    p_approve: input.approve,
    p_note: input.note,
  });
  if (error) return dbError(error, "Could not record the decision");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: input.approve ? "rewards.reward.approve" : "rewards.reward.reject",
    targetType: "reward_event",
    targetId: input.rewardEventId,
    summary: `${input.approve ? "Approved" : "Rejected"} a held reward${
      before?.is_shadow ? " (shadow)" : ""
    }`,
    reason: input.note,
    before: before ?? undefined,
    after: { status: data },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: input.approve
      ? "Approved. It unlocks when it's due (after the event, or two weeks after a place claim)."
      : "Rejected. Nothing will be paid for it.",
    data: { status: String(data) },
  };
}

// ── Rule versions ───────────────────────────────────────────

export async function listRewardRulesCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<RewardRuleSummary[]>> {
  try {
    assertPermission(ctx, "rewards.view");
  } catch (e) {
    return denied(e);
  }
  return { status: 200, data: await readRules(supabase) };
}

export type RuleVersionInput = {
  ruleKey: string;
  rateBps: number | null;
  netShareCapBps: number | null;
  flatMinor: number | null;
  minBasisMinor: number;
  caps: Record<string, number>;
  expiryDays: number | null;
  note: string;
};

/**
 * Publishes a NEW, inactive version of a rule (versions are never edited).
 * Terms not in the input (release policy, lot kind, scope, withdrawable)
 * carry over from the latest version.
 */
export async function publishRewardRuleVersionCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: RuleVersionInput & { reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ id: string; version: number }>> {
  try {
    assertPermission(ctx, "rewards.configure");
  } catch (e) {
    return denied(e);
  }

  const { data: latest } = await supabase
    .from("reward_rule")
    .select("*")
    .eq("rule_key", input.ruleKey)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return { status: 404, message: "Unknown rule" };

  const { data, error } = await supabase
    .from("reward_rule")
    .insert({
      rule_key: latest.rule_key,
      version: latest.version + 1,
      is_active: false,
      rate_bps: input.rateBps,
      net_share_cap_bps: input.netShareCapBps,
      flat_minor: input.flatMinor,
      min_basis_minor: input.minBasisMinor,
      caps: input.caps,
      release_policy: latest.release_policy,
      release_delay: latest.release_delay,
      lot_kind: latest.lot_kind,
      spend_scope: latest.spend_scope,
      expiry_days: input.expiryDays,
      withdrawable: latest.withdrawable,
      withdrawable_delay: latest.withdrawable_delay,
      note: input.note,
      created_by: ctx.userId,
    })
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
    action: "rewards.rule.publish",
    targetType: "reward_rule",
    targetId: data.id,
    summary: `${input.ruleKey} v${data.version} published (inactive)`,
    reason: input.reason,
    before: { version: latest.version },
    after: { ...input, version: data.version },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: `Version ${data.version} published. It isn't live until someone activates it.`,
    data: { id: data.id, version: data.version },
  };
}

type RuleRow = {
  id: string;
  rate_bps: number | null;
  net_share_cap_bps: number | null;
  flat_minor: number | null;
  min_basis_minor: number;
  caps: Record<string, unknown> | null;
  expiry_days: number | null;
  created_by: string | null;
  version: number;
};

/**
 * Whether switching from `current` (null = the rule is off) to `target`
 * could pay out more. Any activation from "off" counts; so does a higher
 * rate, cap, flat amount or per-user limit, a lower minimum order, or a
 * longer expiry.
 */
export function ruleRaisesCost(
  target: RuleRow,
  current: RuleRow | null,
): boolean {
  if (!current) return true;
  const more = (a: number | null, b: number | null) => num(a) > num(b);
  if (more(target.rate_bps, current.rate_bps)) return true;
  if (more(target.net_share_cap_bps, current.net_share_cap_bps)) return true;
  if (more(target.flat_minor, current.flat_minor)) return true;
  if (num(target.min_basis_minor) < num(current.min_basis_minor)) return true;
  if (more(target.expiry_days, current.expiry_days)) return true;
  const tc = target.caps ?? {};
  const cc = current.caps ?? {};
  for (const key of new Set([...Object.keys(tc), ...Object.keys(cc)])) {
    const t = tc[key];
    const c = cc[key];
    if (typeof t === "number" && (typeof c !== "number" || t > c)) return true;
    if (typeof c === "number" && t === undefined) return true;
  }
  return false;
}

/**
 * Makes a version live (or switches the rule off with ruleId null). A
 * version that could pay out more than what's live now must be activated by
 * a different admin from the one who published it (owner decision: rule
 * changes that raise costs need a second approver). The owner-approved seed
 * versions have no author and can be activated by anyone with the
 * permission.
 */
// Mechanisms whose engine exists. Making any other rule live would do
// nothing except advertise it in "How to earn", so it's refused.
const SHIPPED_RULES = new Set([
  "event_referral",
  "friend_referral_referrer",
  "friend_referral_referee",
  "organizer_rebate",
  "venue_rebate",
  "organizer_milestone",
]);

export async function setRewardRuleActiveCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { ruleKey: string; ruleId: string | null; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ activeRuleId: string | null }>> {
  try {
    assertPermission(ctx, "rewards.configure");
  } catch (e) {
    return denied(e);
  }

  if (input.ruleId && !SHIPPED_RULES.has(input.ruleKey)) {
    return {
      status: 409,
      message: "This reward isn't built yet, so it can't be made live.",
    };
  }

  const { data: versions, error: readError } = await supabase
    .from("reward_rule")
    .select(
      "id, rule_key, version, is_active, rate_bps, net_share_cap_bps, flat_minor, min_basis_minor, caps, expiry_days, created_by",
    )
    .eq("rule_key", input.ruleKey);
  if (readError) return dbError(readError, "Could not read the rule");

  const current = (versions ?? []).find((v) => v.is_active) ?? null;
  const target = input.ruleId
    ? ((versions ?? []).find((v) => v.id === input.ruleId) ?? null)
    : null;
  if (input.ruleId && !target) {
    return { status: 404, message: "Rule version not found" };
  }
  if (current?.id === target?.id) {
    return { status: 400, message: "Nothing changed." };
  }

  if (
    target &&
    target.created_by === ctx.userId &&
    ruleRaisesCost(target as RuleRow, current as RuleRow | null)
  ) {
    return {
      status: 409,
      message:
        "This version could pay out more than what's live now, so another admin has to activate it.",
    };
  }

  const { error } = await supabase.rpc("reward_rule_set_active", {
    p_rule_key: input.ruleKey,
    p_rule_id: input.ruleId as string,
  });
  if (error) return dbError(error, "Could not change the live version");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: target ? "rewards.rule.activate" : "rewards.rule.deactivate",
    targetType: "reward_rule",
    targetId: target?.id ?? current?.id ?? input.ruleKey,
    summary: target
      ? `${input.ruleKey} v${target.version} is now live${current ? ` (was v${current.version})` : ""}`
      : `${input.ruleKey} switched off${current ? ` (was v${current.version})` : ""}`,
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
