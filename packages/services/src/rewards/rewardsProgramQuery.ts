import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { RewardsProgram } from "@abonten/types/rewards";
import type { SupabaseClient } from "@supabase/supabase-js";

// The public, sanitized view of the Rewards program (get_rewards_program_
// public): whether it's switched on for the caller, and the ACTIVE rule
// terms that drive "How to earn" copy -- so the UI can never promise a rate
// the engine doesn't pay. Callable with any client (anon included);
// `enabled` is evaluated for whoever the client is signed in as.

type ProgramJson = {
  enabled?: boolean;
  event_referral?: {
    rate_bps: number;
    min_order_minor: number;
    expiry_days: number | null;
  } | null;
  friend_referral?: {
    referrer_minor: number | null;
    referee_minor: number | null;
    min_order_minor: number | null;
    welcome_expiry_days: number | null;
  } | null;
  organizer_rebate?: {
    net_share_bps: number;
    expiry_days: number | null;
  } | null;
  venue_rebate?: { net_share_bps: number; expiry_days: number | null } | null;
  redemption?: {
    tickets: boolean;
    promotions: boolean;
    allow_full_credit_ticket_orders: boolean;
    min_cash_charge_minor: number;
  };
  withdrawals?: { enabled: boolean; min_minor: number };
};

export const DISABLED_REWARDS_PROGRAM: RewardsProgram = {
  enabled: false,
  eventReferral: null,
  friendReferral: null,
  organizerRebate: null,
  venueRebate: null,
  redemption: {
    tickets: false,
    promotions: false,
    allowFullCreditTicketOrders: false,
    minCashChargeMinor: 100,
  },
  withdrawals: { enabled: false, minMinor: 10000 },
};

export function mapRewardsProgram(json: ProgramJson | null): RewardsProgram {
  if (!json) return DISABLED_REWARDS_PROGRAM;
  return {
    enabled: json.enabled === true,
    eventReferral: json.event_referral
      ? {
          rateBps: json.event_referral.rate_bps,
          minOrderMinor: json.event_referral.min_order_minor,
          expiryDays: json.event_referral.expiry_days,
        }
      : null,
    friendReferral: json.friend_referral
      ? {
          referrerMinor: json.friend_referral.referrer_minor,
          refereeMinor: json.friend_referral.referee_minor,
          minOrderMinor: json.friend_referral.min_order_minor,
          welcomeExpiryDays: json.friend_referral.welcome_expiry_days,
        }
      : null,
    organizerRebate: json.organizer_rebate
      ? {
          netShareBps: json.organizer_rebate.net_share_bps,
          expiryDays: json.organizer_rebate.expiry_days,
        }
      : null,
    venueRebate: json.venue_rebate
      ? {
          netShareBps: json.venue_rebate.net_share_bps,
          expiryDays: json.venue_rebate.expiry_days,
        }
      : null,
    redemption: {
      tickets: json.redemption?.tickets === true,
      promotions: json.redemption?.promotions === true,
      allowFullCreditTicketOrders:
        json.redemption?.allow_full_credit_ticket_orders === true,
      minCashChargeMinor:
        json.redemption?.min_cash_charge_minor ??
        DISABLED_REWARDS_PROGRAM.redemption.minCashChargeMinor,
    },
    withdrawals: {
      enabled: json.withdrawals?.enabled === true,
      minMinor:
        json.withdrawals?.min_minor ??
        DISABLED_REWARDS_PROGRAM.withdrawals.minMinor,
    },
  };
}

// A hard, deploy-level kill switch that wins over the database settings.
export function rewardsKillSwitchOn(): boolean {
  return process.env.REWARDS_KILL_SWITCH === "true";
}

export async function getRewardsProgramCore(
  supabase: SupabaseClient<Database>,
): Promise<{ status: 200 | 500; message?: string; data: RewardsProgram }> {
  if (rewardsKillSwitchOn()) {
    return { status: 200, data: DISABLED_REWARDS_PROGRAM };
  }

  const { data, error } = await supabase.rpc("get_rewards_program_public");

  if (error) {
    logger.error(`getRewardsProgramCore failed: ${error.message}`);
    return {
      status: 500,
      message: "Something went wrong!",
      data: DISABLED_REWARDS_PROGRAM,
    };
  }

  return { status: 200, data: mapRewardsProgram(data as ProgramJson | null) };
}
