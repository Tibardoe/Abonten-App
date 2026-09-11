import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { PromotionCredit, RebateKind } from "@abonten/types/rewards";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { getRewardsProgramCore } from "./rewardsProgramQuery";

// Promotion credit for organizers and venue owners (Abonten Rewards Phase 6),
// shared by the web Server Action and GET /api/mobile/rewards/promotion-credit.
// The program terms are read with the CALLER's client (whether Rewards is on
// is evaluated for them); the figures come from rebate_stats and
// credit_spendable, which are service-role only and scoped to userId.

type StatsJson = {
  pending_minor?: number;
  earned_minor?: number;
  promotion_only_minor?: number;
  last?: { period_start: string; amount_minor: number } | null;
  recent?: {
    kind: string;
    event_title: string | null;
    amount_minor: number;
    status: string;
    period_start: string | null;
    at: string;
  }[];
};

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const KINDS = new Set<RebateKind>([
  "organizer",
  "venue",
  "milestone",
  "visits",
]);

export async function getPromotionCreditCore(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{
  status: 200 | 401 | 500;
  message?: string;
  data?: PromotionCredit;
}> {
  if (!userId) return { status: 401, message: "User not logged in" };

  const service = getSupabaseServiceClient();
  const [program, stats, spendable] = await Promise.all([
    getRewardsProgramCore(supabase),
    service.rpc("rebate_stats", { p_user_id: userId }),
    service.rpc("credit_spendable", {
      p_user_id: userId,
      p_scope: "promotions",
    }),
  ]);

  if (program.status !== 200 || stats.error || spendable.error) {
    logger.error(
      `getPromotionCreditCore failed for ${userId}: ${
        stats.error?.message ?? spendable.error?.message ?? program.message
      }`,
    );
    return { status: 500, message: "Couldn't load your promotion credit." };
  }

  const p = program.data;
  const s = (stats.data ?? {}) as StatsJson;
  const spend = (spendable.data ?? {}) as { spendable_minor?: number };

  return {
    status: 200,
    data: {
      enabled: p.enabled,
      canRedeem: p.enabled && p.redemption.promotions,
      spendableMinor: p.enabled ? num(spend.spendable_minor) : 0,
      promotionOnlyMinor: num(s.promotion_only_minor),
      pendingMinor: num(s.pending_minor),
      earnedMinor: num(s.earned_minor),
      last: s.last
        ? {
            periodStart: s.last.period_start,
            amountMinor: num(s.last.amount_minor),
          }
        : null,
      recent: (s.recent ?? [])
        .filter((r) => KINDS.has(r.kind as RebateKind))
        .map((r) => ({
          kind: r.kind as RebateKind,
          eventTitle: r.event_title ?? null,
          amountMinor: num(r.amount_minor),
          status: r.status === "earned" ? "earned" : "pending",
          periodStart: r.period_start ?? null,
          at: r.at,
        })),
      rates: {
        organizerShareBps: p.organizerRebate?.netShareBps ?? null,
        venueShareBps: p.venueRebate?.netShareBps ?? null,
        milestone: p.organizerMilestone
          ? {
              uniqueBuyers: p.organizerMilestone.uniqueBuyers,
              amountMinor: p.organizerMilestone.amountMinor,
            }
          : null,
        visits: p.placeVisits
          ? {
              perVisitorMinor: p.placeVisits.perVisitorMinor,
              maxVisitors: p.placeVisits.maxVisitors,
            }
          : null,
        expiryDays:
          p.organizerRebate?.expiryDays ??
          p.venueRebate?.expiryDays ??
          p.organizerMilestone?.expiryDays ??
          p.placeVisits?.expiryDays ??
          null,
      },
    },
  };
}
