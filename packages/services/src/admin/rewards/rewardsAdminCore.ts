import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type {
  AdminCreditAccountDetail,
  AdminCreditAccountListItem,
  AdminCreditAdjustmentRequest,
  AdminCreditJournal,
  AdminCreditLot,
  AdminRewardsOverview,
  CreditAccountStatus,
  CreditJournalType,
  CreditLotKind,
  CreditLotStatus,
  CreditSpendScope,
  RewardRuleSummary,
  RewardsProgramSettings,
} from "@abonten/types/rewards";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// The Rewards module backend for the Admin Console. Every function takes a
// service-role client + a pre-resolved AdminContext and re-checks its own
// permission. Credit only ever moves through the credit_* database
// functions (the ledger tables are SELECT-only even for service_role), so
// these services validate, delegate, and audit -- they never write a
// balance themselves. The transport (apps/admin server actions) adds step-up
// re-authentication for finance.adjust and rewards.configure.

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

type RequestMeta = Record<string, unknown> | undefined;

// An error envelope carries no data, so it fits any AdminEnvelope<T>.
const denied = (e: unknown): AdminEnvelope<never> =>
  adminError(e) as AdminEnvelope<never>;

export async function namesFor(
  supabase: ServiceRoleClient,
  ids: (string | null | undefined)[],
): Promise<Map<string, { username: string | null; fullName: string | null }>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const map = new Map<
    string,
    { username: string | null; fullName: string | null }
  >();
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from("user_info")
    .select("id, username, full_name")
    .in("id", unique);
  for (const row of data ?? []) {
    map.set(row.id, { username: row.username, fullName: row.full_name });
  }
  return map;
}

export const displayName = (
  n: { username: string | null; fullName: string | null } | undefined,
): string | null => n?.fullName || n?.username || null;

// ── Settings + rules ────────────────────────────────────────

type SettingsRow = {
  rewards_enabled: boolean;
  audience: "staff" | "beta" | "all";
  beta_user_ids: string[];
  referral_capture_enabled: boolean;
  shadow_mode: boolean;
  redeem_promotions_enabled: boolean;
  redeem_tickets_enabled: boolean;
  allow_full_credit_ticket_orders: boolean;
  withdrawals_enabled: boolean;
  max_credit_share_of_ticket_order_bps: number;
  min_cash_charge_minor: number;
  budget_floor_minor: number;
  budget_net_revenue_share_bps: number;
  dual_approval_threshold_minor: number;
  support_goodwill_monthly_cap_minor: number;
  credit_share_payout_hold_bps: number;
  withdrawal_min_minor: number;
  referral_attribution_window_days: number;
  updated_at: string;
  updated_by: string | null;
};

function mapSettings(row: SettingsRow): RewardsProgramSettings {
  return {
    rewardsEnabled: row.rewards_enabled,
    audience: row.audience,
    betaUserIds: row.beta_user_ids ?? [],
    referralCaptureEnabled: row.referral_capture_enabled,
    shadowMode: row.shadow_mode,
    redeemPromotionsEnabled: row.redeem_promotions_enabled,
    redeemTicketsEnabled: row.redeem_tickets_enabled,
    allowFullCreditTicketOrders: row.allow_full_credit_ticket_orders,
    withdrawalsEnabled: row.withdrawals_enabled,
    maxCreditShareOfTicketOrderBps: row.max_credit_share_of_ticket_order_bps,
    minCashChargeMinor: num(row.min_cash_charge_minor),
    budgetFloorMinor: num(row.budget_floor_minor),
    budgetNetRevenueShareBps: row.budget_net_revenue_share_bps,
    dualApprovalThresholdMinor: num(row.dual_approval_threshold_minor),
    supportGoodwillMonthlyCapMinor: num(row.support_goodwill_monthly_cap_minor),
    creditSharePayoutHoldBps: row.credit_share_payout_hold_bps,
    withdrawalMinMinor: num(row.withdrawal_min_minor),
    referralAttributionWindowDays: num(row.referral_attribution_window_days),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

async function readSettings(
  supabase: ServiceRoleClient,
): Promise<RewardsProgramSettings | null> {
  const { data, error } = await supabase
    .from("reward_program_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) {
    logger.error(`readSettings failed: ${error?.message ?? "no row"}`);
    return null;
  }
  return mapSettings(data as unknown as SettingsRow);
}

export async function readRules(
  supabase: ServiceRoleClient,
): Promise<RewardRuleSummary[]> {
  const { data, error } = await supabase
    .from("reward_rule")
    .select("*")
    .order("rule_key")
    .order("version", { ascending: false });
  if (error) {
    logger.error(`readRules failed: ${error.message}`);
    return [];
  }
  const names = await namesFor(
    supabase,
    (data ?? []).map((r) => r.created_by),
  );
  return (data ?? []).map((r) => ({
    id: r.id,
    ruleKey: r.rule_key,
    version: r.version,
    isActive: r.is_active,
    rateBps: r.rate_bps,
    netShareCapBps: r.net_share_cap_bps,
    flatMinor: r.flat_minor === null ? null : num(r.flat_minor),
    minBasisMinor: num(r.min_basis_minor),
    caps: (r.caps ?? {}) as Record<string, unknown>,
    releasePolicy: r.release_policy,
    lotKind: r.lot_kind,
    spendScope: r.spend_scope,
    expiryDays: r.expiry_days,
    withdrawable: r.withdrawable,
    note: r.note,
    createdBy: r.created_by,
    createdByName: r.created_by ? displayName(names.get(r.created_by)) : null,
    createdAt: r.created_at,
  }));
}

// ── Overview ────────────────────────────────────────────────

type OverviewJson = {
  balances?: Record<string, number>;
  promotion_only_minor?: number;
  flows?: Record<string, number>;
  pending_adjustments?: number;
  open_disputes?: number;
};

export async function getRewardsOverviewCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  range: { from: string; to: string },
): Promise<AdminEnvelope<AdminRewardsOverview>> {
  try {
    assertPermission(ctx, "rewards.view");
  } catch (e) {
    return denied(e);
  }

  const [overview, recon, settings, rules] = await Promise.all([
    supabase.rpc("admin_rewards_overview", {
      p_from: range.from,
      p_to: range.to,
    }),
    supabase.rpc("credit_reconciliation_checks"),
    readSettings(supabase),
    readRules(supabase),
  ]);

  if (overview.error || recon.error || !settings) {
    logger.error(
      `getRewardsOverviewCore failed: ${overview.error?.message ?? recon.error?.message ?? "settings missing"}`,
    );
    return { status: 500, message: "Something went wrong" };
  }

  const o = (overview.data ?? {}) as OverviewJson;
  const b = o.balances ?? {};
  const r = (recon.data ?? {}) as Record<string, number>;
  const flows: Partial<Record<CreditJournalType, number>> = {};
  for (const [type, amount] of Object.entries(o.flows ?? {})) {
    flows[type as CreditJournalType] = num(amount);
  }

  return {
    status: 200,
    data: {
      balances: {
        accounts: num(b.accounts),
        frozenAccounts: num(b.frozen_accounts),
        inDebtAccounts: num(b.in_debt_accounts),
        availableMinor: num(b.available_minor),
        debtMinor: num(b.debt_minor),
        pendingMinor: num(b.pending_minor),
        reservedMinor: num(b.reserved_minor),
        frozenMinor: num(b.frozen_minor),
        withdrawingMinor: num(b.withdrawing_minor),
        lifetimeEarnedMinor: num(b.lifetime_earned_minor),
        lifetimeSpentMinor: num(b.lifetime_spent_minor),
        lifetimeExpiredMinor: num(b.lifetime_expired_minor),
        lifetimeReversedMinor: num(b.lifetime_reversed_minor),
      },
      promotionOnlyMinor: num(o.promotion_only_minor),
      flows,
      pendingAdjustments: num(o.pending_adjustments),
      openDisputes: num(o.open_disputes),
      reconciliation: {
        unbalancedJournals: num(r.credit_unbalanced_journals),
        balanceCacheDrift: num(r.credit_balance_cache_drift),
        lotBucketDrift: num(r.credit_lot_bucket_drift),
        lotInvalidState: num(r.credit_lot_invalid_state),
      },
      settings,
      rules,
    },
  };
}

// ── Accounts ────────────────────────────────────────────────

export async function listCreditAccountsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: {
    search?: string;
    status?: CreditAccountStatus;
    cursor?: string | null;
    pageSize?: number;
  } = {},
): Promise<PaginatedResult<AdminCreditAccountListItem>> {
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

  // credit_account deliberately has no FK to user_info (history outlives
  // the auth user), so a name search resolves user ids first.
  let userIds: string[] | null = null;
  if (filters.search?.trim()) {
    const s = filters.search.trim().replace(/[%,()]/g, "");
    const { data: users } = await supabase
      .from("user_info")
      .select("id")
      .or(`username.ilike.%${s}%,full_name.ilike.%${s}%`)
      .limit(100);
    userIds = (users ?? []).map((u) => u.id);
    if (userIds.length === 0) {
      return { status: 200, data: [], nextCursor: null, hasNextPage: false };
    }
  }

  let query = supabase
    .from("credit_account")
    .select(
      "user_id, status, available_minor, pending_minor, lifetime_earned_minor, updated_at",
    )
    .order("updated_at", { ascending: false })
    .order("user_id", { ascending: false })
    .limit(pageSize + 1);

  if (userIds) query = query.in("user_id", userIds);
  if (filters.status) query = query.eq("status", filters.status);
  if (cursor) {
    query = query.or(
      `updated_at.lt.${cursor.sortValue},and(updated_at.eq.${cursor.sortValue},user_id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listCreditAccountsCore failed: ${error.message}`);
    return empty(500, "Something went wrong");
  }

  const { page, hasNextPage } = splitPage(data ?? [], pageSize);
  const names = await namesFor(
    supabase,
    page.map((r) => r.user_id),
  );
  const last = page[page.length - 1];

  return {
    status: 200,
    data: page.map((r) => ({
      userId: r.user_id,
      username: names.get(r.user_id)?.username ?? null,
      fullName: names.get(r.user_id)?.fullName ?? null,
      status: r.status as CreditAccountStatus,
      availableMinor: num(r.available_minor),
      pendingMinor: num(r.pending_minor),
      lifetimeEarnedMinor: num(r.lifetime_earned_minor),
      updatedAt: r.updated_at,
    })),
    nextCursor:
      hasNextPage && last
        ? encodeCursor<SimpleCursor>({
            sortValue: last.updated_at,
            id: last.user_id,
          })
        : null,
    hasNextPage,
  };
}

type AdjustmentRow = {
  id: string;
  user_id: string;
  direction: "credit" | "debit";
  amount_minor: number;
  spend_scope: string;
  allow_negative: boolean;
  reason: string;
  user_label: string | null;
  status: "pending" | "executed" | "rejected" | "cancelled";
  requires_second_approver: boolean;
  requested_by: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  journal_id: string | null;
};

async function mapAdjustments(
  supabase: ServiceRoleClient,
  rows: AdjustmentRow[],
): Promise<AdminCreditAdjustmentRequest[]> {
  const names = await namesFor(
    supabase,
    rows.flatMap((r) => [r.user_id, r.requested_by, r.decided_by]),
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: displayName(names.get(r.user_id)),
    direction: r.direction,
    amountMinor: num(r.amount_minor),
    spendScope: r.spend_scope,
    allowNegative: r.allow_negative,
    reason: r.reason,
    userLabel: r.user_label,
    status: r.status,
    requiresSecondApprover: r.requires_second_approver,
    requestedBy: r.requested_by,
    requestedByName: displayName(names.get(r.requested_by)),
    requestedAt: r.requested_at,
    decidedBy: r.decided_by,
    decidedByName: r.decided_by ? displayName(names.get(r.decided_by)) : null,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    journalId: r.journal_id,
  }));
}

export async function getCreditAccountDetailCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  userId: string,
): Promise<AdminEnvelope<AdminCreditAccountDetail>> {
  try {
    assertPermission(ctx, "rewards.view");
  } catch (e) {
    return denied(e);
  }

  const { data: user } = await supabase
    .from("user_info")
    .select("id, username, full_name, status_id")
    .eq("id", userId)
    .maybeSingle();

  const [accountRes, lotsRes, journalsRes, adjustmentsRes, settings] =
    await Promise.all([
      supabase
        .from("credit_account")
        .select("*")
        .eq("user_id", userId)
        .eq("currency", "GHS")
        .maybeSingle(),
      supabase
        .from("credit_lot")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("credit_journal")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(100),
      supabase
        .from("credit_adjustment_request")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      readSettings(supabase),
    ]);

  if (!user && !accountRes.data) {
    return { status: 404, message: "No user or credit account with that id" };
  }
  if (
    accountRes.error ||
    lotsRes.error ||
    journalsRes.error ||
    adjustmentsRes.error
  ) {
    logger.error(
      `getCreditAccountDetailCore failed: ${accountRes.error?.message ?? lotsRes.error?.message ?? journalsRes.error?.message ?? adjustmentsRes.error?.message}`,
    );
    return { status: 500, message: "Something went wrong" };
  }

  const journals = journalsRes.data ?? [];
  const journalIds = journals.map((j) => j.id);

  const linesByJournal = new Map<string, AdminCreditJournal["lines"]>();
  if (journalIds.length > 0) {
    const { data: entries } = await supabase
      .from("credit_entry")
      .select("journal_id, ledger_account_id, lot_id, amount_minor")
      .in("journal_id", journalIds);
    const ledgerIds = [
      ...new Set((entries ?? []).map((e) => e.ledger_account_id)),
    ];
    const { data: ledgers } = ledgerIds.length
      ? await supabase
          .from("credit_ledger_account")
          .select("id, code, owner_user_id")
          .in("id", ledgerIds)
      : { data: [] };
    const ledgerById = new Map((ledgers ?? []).map((l) => [l.id, l]));
    for (const e of entries ?? []) {
      const ledger = ledgerById.get(e.ledger_account_id);
      const list = linesByJournal.get(e.journal_id) ?? [];
      list.push({
        ledgerCode: ledger?.code ?? "unknown",
        isUserAccount: !!ledger?.owner_user_id,
        amountMinor: num(e.amount_minor),
        lotId: e.lot_id,
      });
      linesByJournal.set(e.journal_id, list);
    }
  }

  const actorNames = await namesFor(
    supabase,
    journals.map((j) => j.actor_id),
  );

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const goodwillUsed = journals
    .filter(
      (j) =>
        j.journal_type === "bonus.grant" &&
        j.source_type === "goodwill" &&
        new Date(j.created_at) >= monthStart,
    )
    .reduce((sum, j) => sum + num(j.user_delta_minor), 0);

  const a = accountRes.data;
  const lots: AdminCreditLot[] = (lotsRes.data ?? []).map((l) => ({
    id: l.id,
    kind: l.kind as CreditLotKind,
    spendScope: l.spend_scope as CreditSpendScope,
    status: l.status as CreditLotStatus,
    originalMinor: num(l.original_minor),
    remainingMinor: num(l.remaining_minor),
    heldMinor: num(l.held_minor),
    releasedMinor: l.released_minor === null ? null : num(l.released_minor),
    withdrawable: l.withdrawable,
    expiresAt: l.expires_at,
    releaseAt: l.release_at,
    label: l.label,
    sourceType: l.source_type,
    sourceId: l.source_id,
    createdAt: l.created_at,
  }));

  return {
    status: 200,
    data: {
      user: {
        id: userId,
        username: user?.username ?? null,
        fullName: user?.full_name ?? null,
        accountStatusId: user?.status_id ?? null,
      },
      account: {
        status: (a?.status as CreditAccountStatus) ?? "active",
        statusReason: a?.status_reason ?? null,
        statusChangedAt: a?.status_changed_at ?? null,
        availableMinor: num(a?.available_minor),
        pendingMinor: num(a?.pending_minor),
        reservedMinor: num(a?.reserved_minor),
        frozenMinor: num(a?.frozen_minor),
        withdrawingMinor: num(a?.withdrawing_minor),
        lifetimeEarnedMinor: num(a?.lifetime_earned_minor),
        lifetimeSpentMinor: num(a?.lifetime_spent_minor),
        lifetimeWithdrawnMinor: num(a?.lifetime_withdrawn_minor),
        lifetimeExpiredMinor: num(a?.lifetime_expired_minor),
        lifetimeReversedMinor: num(a?.lifetime_reversed_minor),
        updatedAt: a?.updated_at ?? null,
      },
      lots,
      journals: journals.map((j) => ({
        id: j.id,
        journalType: j.journal_type as CreditJournalType,
        idempotencyKey: j.idempotency_key,
        userDeltaMinor: num(j.user_delta_minor),
        visibleToUser: j.visible_to_user,
        actorType: j.actor_type as "system" | "user" | "admin",
        actorId: j.actor_id,
        actorName: j.actor_id ? displayName(actorNames.get(j.actor_id)) : null,
        userLabel: j.user_label,
        memo: j.memo,
        sourceType: j.source_type,
        sourceId: j.source_id,
        lotId: j.lot_id,
        createdAt: j.created_at,
        lines: linesByJournal.get(j.id) ?? [],
      })),
      adjustments: await mapAdjustments(
        supabase,
        (adjustmentsRes.data ?? []) as unknown as AdjustmentRow[],
      ),
      goodwillUsedThisMonthMinor: goodwillUsed,
      goodwillMonthlyCapMinor: settings?.supportGoodwillMonthlyCapMinor ?? 0,
      dualApprovalThresholdMinor: settings?.dualApprovalThresholdMinor ?? 0,
      referrals: await readReferrals(supabase, userId),
    },
  };
}

// The referral graph around one account: their code, who invited them, and
// the people they invited (most recent 20).
async function readReferrals(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<AdminCreditAccountDetail["referrals"]> {
  const [code, invitedBy, invited] = await Promise.all([
    supabase
      .from("referral_code")
      .select("code, disabled_at, disabled_reason")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_referral")
      .select("referrer_user_id, status, source, bound_at")
      .eq("referee_user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_referral")
      .select("referee_user_id, status, bound_at", { count: "exact" })
      .eq("referrer_user_id", userId)
      .order("bound_at", { ascending: false })
      .limit(20),
  ]);
  const names = await namesFor(supabase, [
    invitedBy.data?.referrer_user_id ?? null,
    ...(invited.data ?? []).map((r) => r.referee_user_id),
  ]);
  return {
    code: code.data
      ? {
          code: code.data.code,
          disabledAt: code.data.disabled_at,
          disabledReason: code.data.disabled_reason,
        }
      : null,
    invitedBy: invitedBy.data
      ? {
          userId: invitedBy.data.referrer_user_id,
          name: displayName(names.get(invitedBy.data.referrer_user_id)),
          status: invitedBy.data.status,
          source: invitedBy.data.source,
          boundAt: invitedBy.data.bound_at,
        }
      : null,
    invited: (invited.data ?? []).map((r) => ({
      userId: r.referee_user_id,
      name: displayName(names.get(r.referee_user_id)),
      status: r.status,
      boundAt: r.bound_at,
    })),
    invitedCount: invited.count ?? 0,
  };
}

/**
 * Turns a user's referral code off (spam, a reported farm) or back on. A
 * disabled code records no new clicks, stamps no checkouts and binds no new
 * friends; rewards already decided are unaffected (review them separately).
 */
export async function setReferralCodeDisabledCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { userId: string; disabled: boolean; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ code: string }>> {
  try {
    assertPermission(ctx, "rewards.freeze");
  } catch (e) {
    return denied(e);
  }

  const { data: before } = await supabase
    .from("referral_code")
    .select("code, disabled_at")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!before)
    return { status: 404, message: "This user has no referral code" };

  const { error } = await supabase
    .from("referral_code")
    .update(
      input.disabled
        ? {
            disabled_at: new Date().toISOString(),
            disabled_reason: input.reason,
            disabled_by: ctx.userId,
          }
        : { disabled_at: null, disabled_reason: null, disabled_by: null },
    )
    .eq("user_id", input.userId);
  if (error) return dbError(error, "Could not change the referral code");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: input.disabled
      ? "rewards.referral_code.disable"
      : "rewards.referral_code.enable",
    targetType: "user",
    targetId: input.userId,
    summary: `Referral code ${before.code} ${input.disabled ? "disabled" : "enabled"}`,
    reason: input.reason,
    before: { disabledAt: before.disabled_at },
    after: { disabled: input.disabled },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: input.disabled
      ? "Referral code disabled."
      : "Referral code enabled.",
    data: { code: before.code },
  };
}

export async function listPendingCreditAdjustmentsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<AdminCreditAdjustmentRequest[]>> {
  try {
    assertPermission(ctx, "rewards.view");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase
    .from("credit_adjustment_request")
    .select("*")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(100);
  if (error) {
    logger.error(`listPendingCreditAdjustmentsCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  return {
    status: 200,
    data: await mapAdjustments(
      supabase,
      (data ?? []) as unknown as AdjustmentRow[],
    ),
  };
}

// ── Mutations ───────────────────────────────────────────────

// Maps a raised Postgres error from a credit_* function to an envelope. The
// functions raise user-safe messages with specific SQLSTATEs.
export function dbError(
  error: { message: string; code?: string },
  fallback: string,
): AdminEnvelope<never> {
  switch (error.code) {
    case "P0002":
      return { status: 404, message: error.message };
    case "42501":
      return { status: 403, message: error.message };
    case "23514":
    case "55000":
    case "22023":
      return { status: 409, message: error.message };
    default:
      logger.error(`${fallback}: ${error.message}`);
      return { status: 500, message: fallback };
  }
}

export async function requestCreditAdjustmentCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    userId: string;
    direction: "credit" | "debit";
    amountMinor: number;
    reason: string;
    userLabel?: string | null;
    spendScope?: "any" | "tickets" | "promotions";
    expiresAt?: string | null;
    allowNegative?: boolean;
  },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ requestId: string; executed: boolean }>> {
  try {
    assertPermission(ctx, "finance.adjust");
  } catch (e) {
    return denied(e);
  }

  const { data, error } = await supabase
    .rpc("credit_request_adjustment", {
      p_user_id: input.userId,
      p_direction: input.direction,
      p_amount_minor: input.amountMinor,
      p_reason: input.reason,
      p_requested_by: ctx.userId,
      p_spend_scope: input.spendScope ?? "any",
      p_expires_at: input.expiresAt ?? undefined,
      p_allow_negative: input.allowNegative ?? false,
      p_user_label: input.userLabel ?? undefined,
    })
    .maybeSingle();

  if (error || !data) {
    return dbError(
      error ?? { message: "No request created" },
      "Could not create the adjustment",
    );
  }

  const request = data as {
    request_id: string;
    requires_second_approver: boolean;
  };

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "rewards.adjustment.request",
    targetType: "user",
    targetId: input.userId,
    summary: `${input.direction === "credit" ? "Add" : "Remove"} ${(input.amountMinor / 100).toFixed(2)} GHS credit${
      request.requires_second_approver ? " (awaiting second approver)" : ""
    }`,
    reason: input.reason,
    after: { requestId: request.request_id, ...input },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  if (request.requires_second_approver) {
    return {
      status: 202,
      message: "Adjustment requested. A second admin needs to approve it.",
      data: { requestId: request.request_id, executed: false },
    };
  }

  const executed = await executeAdjustment(
    supabase,
    ctx,
    request.request_id,
    null,
    requestMeta,
  );
  if (executed.status !== 200) {
    return { status: executed.status, message: executed.message };
  }
  return {
    status: 200,
    message: "Credit adjusted.",
    data: { requestId: request.request_id, executed: true },
  };
}

async function executeAdjustment(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  requestId: string,
  note: string | null,
  requestMeta: RequestMeta,
): Promise<AdminEnvelope<{ journalId: string }>> {
  const { data, error } = await supabase.rpc("credit_execute_adjustment", {
    p_request_id: requestId,
    p_approver: ctx.userId,
    p_note: note ?? undefined,
  });
  if (error || !data) {
    return dbError(
      error ?? { message: "No journal returned" },
      "Could not apply the adjustment",
    );
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "rewards.adjustment.execute",
    targetType: "credit_adjustment_request",
    targetId: requestId,
    summary: "Credit adjustment applied",
    reason: note,
    after: { journalId: data },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return { status: 200, data: { journalId: String(data) } };
}

export async function approveCreditAdjustmentCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { requestId: string; note?: string | null },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ journalId: string }>> {
  try {
    assertPermission(ctx, "finance.adjust");
  } catch (e) {
    return denied(e);
  }
  return executeAdjustment(
    supabase,
    ctx,
    input.requestId,
    input.note ?? null,
    requestMeta,
  );
}

export async function rejectCreditAdjustmentCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { requestId: string; note: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "finance.adjust");
  } catch (e) {
    return denied(e);
  }

  const { error } = await supabase.rpc("credit_reject_adjustment", {
    p_request_id: input.requestId,
    p_admin: ctx.userId,
    p_note: input.note,
  });
  if (error) return dbError(error, "Could not reject the adjustment");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "rewards.adjustment.reject",
    targetType: "credit_adjustment_request",
    targetId: input.requestId,
    summary: "Credit adjustment rejected",
    reason: input.note,
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Adjustment rejected." };
}

export async function grantGoodwillCreditCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    userId: string;
    amountMinor: number;
    reason: string;
    requestId: string;
  },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ journalId: string }>> {
  try {
    assertPermission(ctx, "rewards.goodwill");
  } catch (e) {
    return denied(e);
  }

  const { data, error } = await supabase
    .rpc("credit_grant_goodwill", {
      p_user_id: input.userId,
      p_amount_minor: input.amountMinor,
      p_admin_id: ctx.userId,
      p_reason: input.reason,
      p_idempotency_key: `goodwill:${input.requestId}`,
    })
    .maybeSingle();

  if (error || !data) {
    return dbError(
      error ?? { message: "No journal returned" },
      "Could not grant goodwill credit",
    );
  }

  const result = data as { journal_id: string; created: boolean };
  if (result.created) {
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "rewards.goodwill.grant",
      targetType: "user",
      targetId: input.userId,
      summary: `Goodwill credit ${(input.amountMinor / 100).toFixed(2)} GHS`,
      reason: input.reason,
      after: { journalId: result.journal_id },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
  }

  return {
    status: 200,
    message: "Goodwill credit granted.",
    data: { journalId: result.journal_id },
  };
}

export async function setCreditAccountStatusCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { userId: string; status: "active" | "frozen"; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ previous: string }>> {
  try {
    assertPermission(ctx, "rewards.freeze");
  } catch (e) {
    return denied(e);
  }

  const { data, error } = await supabase.rpc("credit_set_account_status", {
    p_user_id: input.userId,
    p_status: input.status,
    p_reason: input.reason,
    p_actor_id: ctx.userId,
  });
  if (error)
    return dbError(error, "Could not change the credit account status");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action:
      input.status === "frozen"
        ? "rewards.account.freeze"
        : "rewards.account.unfreeze",
    targetType: "user",
    targetId: input.userId,
    summary: `Credit account ${String(data)} → ${input.status}`,
    reason: input.reason,
    before: { status: data },
    after: { status: input.status },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message:
      input.status === "frozen"
        ? "Credit account frozen."
        : "Credit account unfrozen.",
    data: { previous: String(data) },
  };
}

// Program switches + thresholds. Optimistic concurrency on updated_at so two
// admins editing at once can't silently overwrite each other.
// Withdrawal settings are not editable in version 1 (owner decision
// 2026-09-10: no cash withdrawal); they are left out of the patch entirely.
export type RewardsSettingsPatch = Partial<
  Omit<
    RewardsProgramSettings,
    "updatedAt" | "updatedBy" | "withdrawalsEnabled" | "withdrawalMinMinor"
  >
>;

const SETTINGS_COLUMN: Record<keyof RewardsSettingsPatch, string> = {
  rewardsEnabled: "rewards_enabled",
  audience: "audience",
  betaUserIds: "beta_user_ids",
  referralCaptureEnabled: "referral_capture_enabled",
  shadowMode: "shadow_mode",
  redeemPromotionsEnabled: "redeem_promotions_enabled",
  redeemTicketsEnabled: "redeem_tickets_enabled",
  allowFullCreditTicketOrders: "allow_full_credit_ticket_orders",
  maxCreditShareOfTicketOrderBps: "max_credit_share_of_ticket_order_bps",
  minCashChargeMinor: "min_cash_charge_minor",
  budgetFloorMinor: "budget_floor_minor",
  budgetNetRevenueShareBps: "budget_net_revenue_share_bps",
  dualApprovalThresholdMinor: "dual_approval_threshold_minor",
  supportGoodwillMonthlyCapMinor: "support_goodwill_monthly_cap_minor",
  creditSharePayoutHoldBps: "credit_share_payout_hold_bps",
  referralAttributionWindowDays: "referral_attribution_window_days",
};

// Switches for behaviour that isn't built yet. The console shows them
// locked; this refuses them server-side too, so nobody can switch on a
// half-built feature with a crafted request. Remove a key when its phase
// ships (tickets: Phase 3, referral capture + shadow mode: Phase 4). Every
// switch that exists today has shipped.
const UNSHIPPED_SETTINGS = new Set<keyof RewardsSettingsPatch>([]);

export async function updateRewardsSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    patch: RewardsSettingsPatch;
    expectedUpdatedAt: string;
    reason: string;
  },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<RewardsProgramSettings>> {
  try {
    assertPermission(ctx, "rewards.configure");
  } catch (e) {
    return denied(e);
  }

  const before = await readSettings(supabase);
  if (!before) return { status: 500, message: "Something went wrong" };

  // Only fields whose value actually differs are written and audited, so
  // the audit trail says exactly what moved (the form sends every field).
  const update: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const [key, value] of Object.entries(input.patch)) {
    const column = SETTINGS_COLUMN[key as keyof RewardsSettingsPatch];
    const previous = before[key as keyof RewardsProgramSettings];
    if (!column || value === undefined) continue;
    if (JSON.stringify(previous) === JSON.stringify(value)) continue;
    update[column] = value;
    changed.push(key);
  }
  if (changed.length === 0) {
    return { status: 400, message: "Nothing changed." };
  }
  const unshipped = changed.filter((key) =>
    UNSHIPPED_SETTINGS.has(key as keyof RewardsSettingsPatch),
  );
  if (unshipped.length > 0) {
    return {
      status: 409,
      message: `These switches control features that haven't shipped yet: ${unshipped.join(", ")}.`,
    };
  }
  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("reward_program_setting")
    .update(update as never)
    .eq("id", 1)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("*")
    .maybeSingle();

  if (error) {
    logger.error(`updateRewardsSettingsCore failed: ${error.message}`);
    return { status: 400, message: error.message };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed these settings. Reload and try again.",
    };
  }

  const after = mapSettings(data as unknown as SettingsRow);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "rewards.settings.update",
    targetType: "reward_program_setting",
    targetId: "1",
    summary: `Rewards settings changed: ${changed.join(", ")}`,
    reason: input.reason,
    before: Object.fromEntries(
      changed.map((k) => [k, before[k as keyof RewardsProgramSettings]]),
    ),
    after: Object.fromEntries(
      changed.map((k) => [k, after[k as keyof RewardsProgramSettings]]),
    ),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return { status: 200, message: "Settings saved.", data: after };
}
