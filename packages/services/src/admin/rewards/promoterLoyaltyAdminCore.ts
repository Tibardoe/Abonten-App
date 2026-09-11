import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  AdminPromoterLoyaltySummary,
  RewardEventStatus,
} from "@abonten/types/rewards";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
} from "../adminContext";
import { displayName, namesFor } from "./rewardsAdminCore";

// Admin side of Rewards Phase 8's per-sale rewards: organizer-funded
// promoter commissions and the loyalty fee rebate. Read-only; the decisions
// themselves are listed with listRewardEventsCore. Same contract as the
// other Rewards admin cores (service-role client + resolved AdminContext).

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

type Bucket = Partial<
  Record<RewardEventStatus, { count: number; amountMinor: number }>
>;

export async function getPromoterLoyaltySummaryCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  sinceDays = 30,
): Promise<AdminEnvelope<AdminPromoterLoyaltySummary>> {
  try {
    assertPermission(ctx, "rewards.view");
  } catch (e) {
    return adminError(e) as AdminEnvelope<never>;
  }

  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const [events, offers, ledger, settings, live] = await Promise.all([
    supabase
      .from("reward_event")
      .select(
        "rule_key, status, is_shadow, amount_minor, released_minor, basis, beneficiary_user_id",
      )
      .in("rule_key", ["promoter_commission", "loyalty_fee_rebate"])
      .gte("created_at", since)
      .limit(10_000),
    supabase
      .from("event_promoter_commission")
      .select("event_id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("organizer_ledger_entry")
      .select("amount")
      .in("entry_type", ["promoter_commission", "promoter_commission_reversal"])
      .gte("created_at", since)
      .limit(10_000),
    supabase
      .from("reward_program_setting")
      .select("shadow_mode")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("reward_rule")
      .select("rule_key")
      .eq("is_active", true)
      .in("rule_key", ["promoter_commission", "loyalty_fee_rebate"]),
  ]);
  if (events.error || ledger.error) {
    logger.error(
      `getPromoterLoyaltySummaryCore failed: ${events.error?.message ?? ledger.error?.message}`,
    );
    return { status: 500, message: "Something went wrong" };
  }

  const commission: Bucket = {};
  const loyalty: Bucket = {};
  const shadow = {
    commission: { count: 0, amountMinor: 0 },
    loyalty: { count: 0, amountMinor: 0 },
  };
  const promoters = new Map<string, { sales: number; amountMinor: number }>();
  let revenue = 0;

  for (const row of events.data ?? []) {
    const status = row.status as RewardEventStatus;
    const amount =
      status === "released" ? num(row.released_minor) : num(row.amount_minor);
    const isCommission = row.rule_key === "promoter_commission";
    if (row.is_shadow) {
      if (status !== "rejected" && status !== "voided") {
        const s = isCommission ? shadow.commission : shadow.loyalty;
        s.count += 1;
        s.amountMinor += amount;
      }
      continue;
    }
    const target = isCommission ? commission : loyalty;
    const bucket = target[status] ?? { count: 0, amountMinor: 0 };
    bucket.count += 1;
    bucket.amountMinor += amount;
    target[status] = bucket;

    if (isCommission && status !== "rejected" && status !== "voided") {
      revenue += num(
        (row.basis as Record<string, unknown> | null)?.ticket_revenue_minor,
      );
      const p = promoters.get(row.beneficiary_user_id) ?? {
        sales: 0,
        amountMinor: 0,
      };
      p.sales += 1;
      p.amountMinor += amount;
      promoters.set(row.beneficiary_user_id, p);
    }
  }

  const charged = (ledger.data ?? []).reduce(
    (sum, r) => sum - Math.round(num(r.amount) * 100),
    0,
  );
  const top = [...promoters.entries()]
    .sort(([, a], [, b]) => b.amountMinor - a.amountMinor)
    .slice(0, 10);
  const names = await namesFor(
    supabase,
    top.map(([id]) => id),
  );

  return {
    status: 200,
    data: {
      sinceDays,
      shadowMode: settings.data?.shadow_mode !== false,
      liveRules: (live.data ?? []).map(
        (r) => r.rule_key as "promoter_commission" | "loyalty_fee_rebate",
      ),
      activeOffers: offers.count ?? 0,
      commission: {
        byStatus: commission,
        shadow: shadow.commission,
        revenueMinor: revenue,
        organizerChargedMinor: charged,
      },
      loyalty: { byStatus: loyalty, shadow: shadow.loyalty },
      topPromoters: top.map(([userId, p]) => ({
        userId,
        name: displayName(names.get(userId)),
        sales: p.sales,
        amountMinor: p.amountMinor,
      })),
    },
  };
}
