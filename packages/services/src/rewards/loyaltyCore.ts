import { logger } from "@abonten/core/logger";
import type { LoyaltyProgress } from "@abonten/types/rewards";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { rewardsKillSwitchOn } from "./rewardsProgramQuery";

// The loyalty fee rebate (Abonten Rewards Phase 8): every Nth ticket order
// on a different event gets its service fee back as credit. This is only the
// caller's progress for the Rewards page -- the reward itself is decided by
// the engine (_reward_loyalty_evaluate) when an order is paid. Shared by the
// getLoyaltyProgress Server Action and GET /api/mobile/rewards/loyalty.

type ProgressJson = {
  orders_required?: number;
  window_days?: number;
  min_order_minor?: number;
  fee_share_bps?: number | null;
  max_per_reward_minor?: number;
  orders_counted?: number;
  oldest_counts_until?: string | null;
  pending_minor?: number;
  earned_minor?: number;
};

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Null data = the loyalty reward isn't live. */
export async function getLoyaltyProgressCore(userId: string): Promise<{
  status: 200 | 401 | 500;
  message?: string;
  data?: LoyaltyProgress | null;
}> {
  if (!userId) return { status: 401, message: "User not logged in" };
  if (rewardsKillSwitchOn()) return { status: 200, data: null };

  const { data, error } = await getSupabaseServiceClient().rpc(
    "loyalty_progress",
    { p_user_id: userId },
  );
  if (error) {
    logger.error(`loyalty_progress failed for ${userId}: ${error.message}`);
    return { status: 500, message: "Couldn't load your loyalty progress." };
  }
  const p = data as ProgressJson | null;
  if (!p) return { status: 200, data: null };

  return {
    status: 200,
    data: {
      ordersRequired: num(p.orders_required),
      windowDays: num(p.window_days),
      minOrderMinor: num(p.min_order_minor),
      feeShareBps: num(p.fee_share_bps ?? 10000),
      maxPerRewardMinor: num(p.max_per_reward_minor),
      ordersCounted: num(p.orders_counted),
      oldestCountsUntil: p.oldest_counts_until ?? null,
      pendingMinor: num(p.pending_minor),
      earnedMinor: num(p.earned_minor),
    },
  };
}
