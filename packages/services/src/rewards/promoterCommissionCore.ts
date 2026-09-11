import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { EventPromoterCommission } from "@abonten/types/rewards";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "../security/rateLimit";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { getRewardsProgramCore } from "./rewardsProgramQuery";

// Organizer-funded promoter commissions (Abonten Rewards Phase 8). The
// organizer offers a share of the ticket price on one event; whoever's
// referral link sells a ticket gets it as Abonten Credit after the event, and
// the same amount comes off the organizer's payout (the reward engine posts
// both -- _reward_evaluate_promoter_commission). Shared by the web Server
// Actions and /api/mobile/organizer/events/[id]/promoter-commission.

type Envelope<T> = {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 429 | 500;
  message?: string;
  data?: T;
};

type StatsJson = {
  sales?: number;
  promoters?: number;
  revenue_minor?: number;
  pending_minor?: number;
  paid_minor?: number;
};

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

async function ownedEvent(
  userId: string,
  eventId: string,
): Promise<
  | { ok: true; status: string }
  | { ok: false; status: 404 | 403 | 500; message: string }
> {
  const { data, error } = await getSupabaseServiceClient()
    .from("event")
    .select("organizer_id, status")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    logger.error(`promoter commission: event read failed: ${error.message}`);
    return { ok: false, status: 500, message: "Something went wrong!" };
  }
  if (!data) return { ok: false, status: 404, message: "Event not found." };
  if (data.organizer_id !== userId) {
    return {
      ok: false,
      status: 403,
      message: "Only the event's organizer can change this.",
    };
  }
  return { ok: true, status: String(data.status) };
}

/** The organizer's view of an event's promoter commission. */
export async function getEventPromoterCommissionCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<Envelope<EventPromoterCommission>> {
  if (!userId) return { status: 401, message: "User not logged in" };
  if (!eventId) return { status: 400, message: "Event is required." };

  const owned = await ownedEvent(userId, eventId);
  if (!owned.ok) return { status: owned.status, message: owned.message };

  const service = getSupabaseServiceClient();
  const [program, offer, stats] = await Promise.all([
    getRewardsProgramCore(supabase),
    service
      .from("event_promoter_commission")
      .select("rate_bps, is_active")
      .eq("event_id", eventId)
      .maybeSingle(),
    service.rpc("promoter_commission_event_stats", { p_event_id: eventId }),
  ]);
  if (program.status !== 200 || offer.error || stats.error) {
    logger.error(
      `getEventPromoterCommissionCore failed for ${eventId}: ${
        offer.error?.message ?? stats.error?.message ?? program.message
      }`,
    );
    return { status: 500, message: "Couldn't load the promoter commission." };
  }

  const terms = program.data.enabled ? program.data.promoterCommission : null;
  const s = (stats.data ?? {}) as StatsJson;
  return {
    status: 200,
    data: {
      available: !!terms,
      rateBps: offer.data?.is_active ? offer.data.rate_bps : null,
      minRateBps: terms?.minRateBps ?? 100,
      maxRateBps: terms?.maxRateBps ?? 3000,
      stats: {
        sales: num(s.sales),
        promoters: num(s.promoters),
        revenueMinor: num(s.revenue_minor),
        pendingMinor: num(s.pending_minor),
        paidMinor: num(s.paid_minor),
      },
    },
  };
}

/**
 * Sets (rateBps) or stops (null) the commission on one of the caller's
 * events. A change applies to tickets sold from now on; sales already made
 * keep the rate they were sold at.
 */
export async function setEventPromoterCommissionCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { eventId: string; rateBps: number | null },
): Promise<Envelope<EventPromoterCommission>> {
  if (!userId) return { status: 401, message: "User not logged in" };
  if (!input?.eventId) return { status: 400, message: "Event is required." };

  const allowed = await checkRateLimit(
    `promoter-commission:${userId}`,
    20,
    3600,
  );
  if (!allowed) {
    return {
      status: 429,
      message: "Too many changes. Try again in a little while.",
    };
  }

  const owned = await ownedEvent(userId, input.eventId);
  if (!owned.ok) return { status: owned.status, message: owned.message };

  const service = getSupabaseServiceClient();

  if (input.rateBps === null) {
    const { error } = await service
      .from("event_promoter_commission")
      .update({
        is_active: false,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("event_id", input.eventId);
    if (error) {
      logger.error(`Stopping promoter commission failed: ${error.message}`);
      return { status: 500, message: "Couldn't stop the commission." };
    }
    return getEventPromoterCommissionCore(supabase, userId, input.eventId);
  }

  if (owned.status === "canceled" || owned.status === "completed") {
    return {
      status: 409,
      message: "This event isn't selling tickets any more.",
    };
  }

  const program = await getRewardsProgramCore(supabase);
  const terms = program.data.enabled ? program.data.promoterCommission : null;
  if (!terms) {
    return {
      status: 409,
      message: "Promoter commissions aren't available yet.",
    };
  }

  const rate = Math.round(Number(input.rateBps));
  if (
    !Number.isFinite(rate) ||
    rate < terms.minRateBps ||
    rate > terms.maxRateBps
  ) {
    return {
      status: 400,
      message: `Choose a commission between ${terms.minRateBps / 100}% and ${terms.maxRateBps / 100}%.`,
    };
  }

  const { error } = await service.from("event_promoter_commission").upsert(
    {
      event_id: input.eventId,
      rate_bps: rate,
      is_active: true,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id" },
  );
  if (error) {
    logger.error(`Saving promoter commission failed: ${error.message}`);
    return { status: 500, message: "Couldn't save the commission." };
  }
  return getEventPromoterCommissionCore(supabase, userId, input.eventId);
}

/**
 * The commission a sharer can earn on an event (for "share and earn" copy):
 * the rate while commissions are live for the caller and the event offers
 * one, else null. Reads with the caller's client (the offer is public).
 */
export async function getEventPromoterOfferCore(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<{ status: 200 | 400 | 500; data?: { rateBps: number } | null }> {
  if (!eventId) return { status: 400 };
  const [program, offer] = await Promise.all([
    getRewardsProgramCore(supabase),
    supabase
      .from("event_promoter_commission")
      .select("rate_bps")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (offer.error) {
    logger.error(`getEventPromoterOfferCore failed: ${offer.error.message}`);
    return { status: 500 };
  }
  const terms = program.data.enabled ? program.data.promoterCommission : null;
  if (!terms || !offer.data) return { status: 200, data: null };
  return {
    status: 200,
    data: {
      rateBps: Math.min(
        Math.max(offer.data.rate_bps, terms.minRateBps),
        terms.maxRateBps,
      ),
    },
  };
}
