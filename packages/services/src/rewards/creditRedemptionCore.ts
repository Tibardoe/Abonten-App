import { logger } from "@abonten/core/logger";
import { toPesewas } from "@abonten/core/paystackAmount";
import { allocateCredit } from "@abonten/core/rewards/creditAllocation";
import type { Database } from "@abonten/types/database.types";
import type { CreditBlockedReason, CreditQuote } from "@abonten/types/rewards";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { rewardsKillSwitchOn } from "./rewardsProgramQuery";

// Spending Abonten Credit at checkout (Phase 2: promotions). The credit
// itself only ever moves through the service-role credit_* functions
// (migration credit_reservations): reserve when the payment starts, capture
// when the purchase is confirmed, release when it fails or lapses.
//
// The order total used here comes from the promotion TIER, not from the
// checkout row's total_price. (Clients can no longer write that row --
// migration lock_money_path_client_writes -- but pricing from the tier keeps
// a single source of truth for cash and credit orders alike.)

export type PromotionKind = "event" | "place";

type PromotionTarget = {
  checkoutTable: "event_promotion_checkout" | "place_promotion_checkout";
  targetType: "event_promotion_checkout" | "place_promotion_checkout";
  attemptColumn: "event_promotion_checkout_id" | "place_promotion_checkout_id";
  sweepRpc:
    | "expire_stale_event_promotion_checkouts"
    | "expire_stale_place_promotion_checkouts";
};

export const PROMOTION_TARGETS: Record<PromotionKind, PromotionTarget> = {
  event: {
    checkoutTable: "event_promotion_checkout",
    targetType: "event_promotion_checkout",
    attemptColumn: "event_promotion_checkout_id",
    sweepRpc: "expire_stale_event_promotion_checkouts",
  },
  place: {
    checkoutTable: "place_promotion_checkout",
    targetType: "place_promotion_checkout",
    attemptColumn: "place_promotion_checkout_id",
    sweepRpc: "expire_stale_place_promotion_checkouts",
  },
};

export type PromotionOrder = {
  checkoutId: string;
  status: string;
  orderTotalMinor: number;
  currency: string;
  expiresAt: string | null;
  /** Shown on the credit activity line: "Used on a feature for {name}". */
  label: string;
};

type CheckoutWithTier = {
  id: string;
  status: string;
  currency: string;
  expires_at: string | null;
  tier: { price: number; currency: string } | null;
  entity: { name?: string | null; title?: string | null } | null;
};

/** The caller's own promotion checkout, priced from its tier. */
export async function loadPromotionOrder(
  supabase: SupabaseClient<Database>,
  userId: string,
  kind: PromotionKind,
  checkoutId: string,
): Promise<PromotionOrder | null> {
  const select =
    kind === "event"
      ? "id, status, currency, expires_at, tier:event_promotion_tier(price, currency), entity:event(title)"
      : "id, status, currency, expires_at, tier:place_promotion_tier(price, currency), entity:place(name)";

  const { data, error } = await supabase
    .from(PROMOTION_TARGETS[kind].checkoutTable)
    .select(select)
    .eq("id", checkoutId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    logger.error(`loadPromotionOrder failed: ${error.message}`);
    throw new Error("Failed to load the promotion checkout");
  }
  const row = data as unknown as CheckoutWithTier | null;
  if (!row?.tier) return null;

  const name = row.entity?.title ?? row.entity?.name ?? null;
  return {
    checkoutId: row.id,
    status: row.status,
    orderTotalMinor: toPesewas(Number(row.tier.price)),
    currency: row.tier.currency ?? row.currency,
    expiresAt: row.expires_at,
    label: name ? `a feature for ${name}` : "a promotion",
  };
}

type SpendableJson = {
  spendable_minor?: number;
  blocked_reason?: string | null;
  min_cash_charge_minor?: number;
};

export async function getSpendableCredit(
  userId: string,
  scope: "promotions" | "tickets",
): Promise<{
  spendableMinor: number;
  blockedReason: CreditBlockedReason | null;
  minCashChargeMinor: number;
}> {
  if (rewardsKillSwitchOn()) {
    return {
      spendableMinor: 0,
      blockedReason: "program_off",
      minCashChargeMinor: 100,
    };
  }
  const { data, error } = await getSupabaseServiceClient().rpc(
    "credit_spendable",
    { p_user_id: userId, p_scope: scope },
  );
  if (error) {
    logger.error(`credit_spendable failed: ${error.message}`);
    throw new Error("Failed to read spendable credit");
  }
  const json = (data ?? {}) as SpendableJson;
  return {
    spendableMinor: Number(json.spendable_minor ?? 0),
    blockedReason: (json.blocked_reason as CreditBlockedReason | null) ?? null,
    minCashChargeMinor: Number(json.min_cash_charge_minor ?? 100),
  };
}

function quoteFor(
  order: PromotionOrder,
  spendable: Awaited<ReturnType<typeof getSpendableCredit>>,
): CreditQuote {
  const offered =
    spendable.blockedReason !== "program_off" &&
    spendable.blockedReason !== "redemption_off";
  const allocation = offered
    ? allocateCredit({
        orderTotalMinor: order.orderTotalMinor,
        spendableMinor: spendable.spendableMinor,
        minCashChargeMinor: spendable.minCashChargeMinor,
        allowFullCredit: true,
      })
    : { creditMinor: 0, cashMinor: order.orderTotalMinor, creditOnly: false };

  return {
    offered,
    blockedReason:
      spendable.blockedReason ??
      (allocation.creditMinor === 0 ? "order_too_small" : null),
    orderTotalMinor: order.orderTotalMinor,
    spendableMinor: spendable.spendableMinor,
    creditMinor: allocation.creditMinor,
    cashMinor: allocation.cashMinor,
    creditOnly: allocation.creditOnly,
    currency: order.currency,
  };
}

export type PromotionCreditQuoteResult =
  | { status: 200; data: CreditQuote }
  | { status: 404 | 410 | 500; message: string };

/** What the "Use credit" switch offers on a pending promotion checkout. */
export async function getPromotionCreditQuoteCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { kind: PromotionKind; checkoutId: string },
): Promise<PromotionCreditQuoteResult> {
  try {
    const order = await loadPromotionOrder(
      supabase,
      userId,
      input.kind,
      input.checkoutId,
    );
    if (!order) return { status: 404, message: "Checkout not found" };
    if (order.status !== "pending") {
      return {
        status: 410,
        message: "This checkout has expired. Please start again.",
      };
    }
    const spendable = await getSpendableCredit(userId, "promotions");
    return { status: 200, data: quoteFor(order, spendable) };
  } catch {
    return { status: 500, message: "Something went wrong!" };
  }
}

export async function computePromotionCredit(
  order: PromotionOrder,
  userId: string,
): Promise<CreditQuote> {
  return quoteFor(order, await getSpendableCredit(userId, "promotions"));
}

// ── Reservation lifecycle (service role) ────────────────────────────

export type CreditReservationRow = {
  id: string;
  user_id: string;
  status: "reserved" | "captured" | "released";
  scope: "promotions" | "tickets";
  target_type: string;
  target_id: string;
  payment_attempt_id: string | null;
  amount_minor: number;
  order_total_minor: number;
  cash_minor: number;
  label: string | null;
};

const RESERVATION_SELECT =
  "id, user_id, status, scope, target_type, target_id, payment_attempt_id, amount_minor, order_total_minor, cash_minor, label";

/**
 * How long credit stays held for a checkout: until it lapses (capped at an
 * hour as a backstop), plus 30 minutes for a slow Mobile Money approval.
 * The 5-minute sweep releases it after.
 */
export function reservationExpiry(checkoutExpiresAt: string | null): string {
  const now = Date.now();
  const hour = now + 60 * 60 * 1000;
  const lapse = checkoutExpiresAt
    ? Math.min(new Date(checkoutExpiresAt).getTime(), hour)
    : now + 30 * 60 * 1000;
  return new Date(Math.max(lapse, now) + 30 * 60 * 1000).toISOString();
}

export async function reserveCredit(input: {
  userId: string;
  scope: "promotions" | "tickets";
  targetType: string;
  targetId: string;
  paymentAttemptId: string;
  amountMinor: number;
  orderTotalMinor: number;
  expiresAt: string;
  label: string;
}): Promise<
  { ok: true; reservationId: string } | { ok: false; message: string }
> {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "credit_reserve",
    {
      p_user_id: input.userId,
      p_amount_minor: input.amountMinor,
      p_order_total_minor: input.orderTotalMinor,
      p_scope: input.scope,
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_payment_attempt_id: input.paymentAttemptId,
      p_expires_at: input.expiresAt,
      p_label: input.label,
    },
  );
  if (error || !data) {
    logger.error(`credit_reserve failed: ${error?.code} ${error?.message}`);
    return {
      ok: false,
      message:
        error?.code === "23514"
          ? "Your credit balance changed. Check the amount and try again."
          : error?.code === "55000"
            ? error.message
            : "We couldn't apply your credit. Please try again.",
    };
  }
  return { ok: true, reservationId: data as string };
}

/** Releases every open reservation on a checkout (a new attempt replaces it). */
export async function releaseOpenReservations(
  targetType: string,
  targetId: string,
  reason: string,
): Promise<void> {
  const service = getSupabaseServiceClient();
  const { data, error } = await service
    .from("credit_reservation")
    .select("id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("status", "reserved");
  if (error) {
    logger.error(`releaseOpenReservations lookup failed: ${error.message}`);
    throw new Error("Failed to release held credit");
  }
  for (const row of data ?? []) {
    const { error: releaseError } = await service.rpc(
      "credit_release_reservation",
      { p_reservation_id: row.id, p_reason: reason },
    );
    if (releaseError) {
      logger.error(
        `credit_release_reservation(${row.id}) failed: ${releaseError.message}`,
      );
      throw new Error("Failed to release held credit");
    }
  }
}

export async function releaseReservation(
  reservationId: string,
  reason: string,
): Promise<void> {
  const { error } = await getSupabaseServiceClient().rpc(
    "credit_release_reservation",
    { p_reservation_id: reservationId, p_reason: reason },
  );
  if (error) {
    logger.error(
      `credit_release_reservation(${reservationId}) failed: ${error.message}`,
    );
  }
}

/**
 * The reservation a payment attempt was started with. Looked up by the
 * attempt id recorded on the reservation by credit_reserve -- the
 * reservation, not the attempt row, is the source of truth for credit.
 */
export async function getReservationForAttempt(
  paymentAttemptId: string,
): Promise<CreditReservationRow | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("credit_reservation")
    .select(RESERVATION_SELECT)
    .eq("payment_attempt_id", paymentAttemptId)
    .maybeSingle();
  if (error) {
    logger.error(`getReservationForAttempt failed: ${error.message}`);
    throw new Error("Failed to read the credit reservation");
  }
  return (data as unknown as CreditReservationRow | null) ?? null;
}

export async function captureReservation(
  reservationId: string,
  transactionId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await getSupabaseServiceClient().rpc(
    "credit_capture_reservation",
    { p_reservation_id: reservationId, p_transaction_id: transactionId },
  );
  if (error) {
    logger.error(
      `credit_capture_reservation(${reservationId}) failed: ${error.code} ${error.message}`,
    );
    return {
      ok: false,
      message:
        error.code === "23514"
          ? "The credit for this order is no longer available."
          : "We couldn't apply your credit.",
    };
  }
  return { ok: true };
}
