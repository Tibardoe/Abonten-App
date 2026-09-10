import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import { fromPesewas } from "@abonten/core/paystackAmount";
import {
  type PaymentAttemptRow,
  upsertPaymentAttemptForSession,
} from "@abonten/services/payments/paymentAttempt";
import {
  type SelectedPaymentMethod,
  initiatePaystackChargeForAttempt,
} from "@abonten/services/payments/paystackInit";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROMOTION_TARGETS,
  type PromotionKind,
  computePromotionCredit,
  loadPromotionOrder,
  releaseOpenReservations,
  releaseReservation,
  reservationExpiry,
  reserveCredit,
} from "../rewards/creditRedemptionCore";
import type { PaymentFulfillmentDeps } from "./fulfillmentDeps";
import {
  type VerifyPaystackPaymentCoreResult,
  verifyPaystackPaymentCore,
} from "./verifyPaystackPaymentCore";

// Starts paying for a pending event/place promotion checkout -- the single
// implementation behind the web createPromotionPaymentAttempt action and the
// mobile POST /api/mobile/checkout/{promotion,place-promotion}-attempt
// routes. (The older createPaymentAttempt action's promotion branches are no
// longer called by any UI.)
//
// Three shapes:
//   * cash only (useCredit false): unchanged -- payment-method fetch, the
//     stale-checkout sweep, the owner-scoped checkout read for the amount,
//     upsertPaymentAttemptForSession, initiatePaystackChargeForAttempt.
//   * part credit: the credit is reserved against a new attempt whose
//     `amount` is the CASH part only, and Paystack charges that. The credit
//     is captured by finalizePaystackPayment once Paystack confirms.
//   * credit only: an attempt with provider 'abonten_credit' and amount 0;
//     the credit is reserved and the purchase is finalized right here
//     through the same finalizePaystackPayment (no Paystack call). The
//     result carries that verification outcome.
// Deliberately NOT a "use server" file.

export type PromotionPaystackInfo =
  | {
      mode: "popup";
      reference: string;
      accessCode: string;
      authorizationUrl: string;
    }
  | {
      mode: "direct";
      reference: string;
      chargeStatus: string;
      displayMessage?: string;
    };

export type CreatePromotionPaymentAttemptResult =
  | { status: 400 | 404 | 409 | 410 | 500; message: string }
  | {
      status: 200;
      data: {
        attempt: PaymentAttemptRow;
        /** null when credit paid for everything. */
        paystack: PromotionPaystackInfo | null;
        credit: { appliedMinor: number; cashMinor: number } | null;
        /** Credit-only orders are finalized immediately; this is the outcome. */
        verification: VerifyPaystackPaymentCoreResult | null;
      };
    };

const ATTEMPT_SELECT =
  "id, status, amount, currency, payment_method_id, provider_reference, metadata";

export async function createPromotionPaymentAttemptCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  userEmail: string | undefined,
  input: {
    kind: PromotionKind;
    checkoutId: string;
    /** Required unless credit covers the whole order. */
    paymentMethodId?: string | null;
    useCredit?: boolean;
  },
  buildCallbackUrl: (checkoutId: string) => string,
  fulfillmentDeps?: PaymentFulfillmentDeps,
): Promise<CreatePromotionPaymentAttemptResult> {
  const cfg = PROMOTION_TARGETS[input.kind];

  if (!userEmail) {
    return {
      status: 400,
      message: "Your account needs a verified email to pay",
    };
  }

  await supabase.rpc(cfg.sweepRpc);

  if (input.useCredit) {
    return startCreditPayment(
      supabase,
      userId,
      userEmail,
      input,
      buildCallbackUrl,
      fulfillmentDeps,
    );
  }

  if (!input.paymentMethodId) {
    return { status: 400, message: "Choose a payment method" };
  }

  const method = await loadPaymentMethod(
    supabase,
    userId,
    input.paymentMethodId,
  );
  if (method === "error") {
    return { status: 500, message: "Something went wrong!" };
  }
  if (!method) {
    return { status: 404, message: "Payment method not found" };
  }

  const { data: checkout, error: checkoutError } = await supabase
    .from(cfg.checkoutTable)
    .select("total_price, currency")
    .eq("id", input.checkoutId)
    .eq("owner_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (checkoutError) {
    logger.error(
      `Failed fetching promotion checkout: ${checkoutError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }
  if (!checkout) {
    return {
      status: 410,
      message: "This checkout has expired. Please start again.",
    };
  }

  // Switching from a credit payment back to cash: an open attempt that was
  // started with credit must not be reused (it would charge only the cash
  // part), so cancel it and give the credit back first.
  const switched = await dropOpenCreditAttempts(
    supabase,
    userId,
    input.kind,
    input.checkoutId,
    { onlyCredit: true },
  );
  if (switched !== "ok") return switched;

  const amount = checkout.total_price as number;
  const currency = checkout.currency as string;

  const attemptResult = await upsertPaymentAttemptForSession(
    userId,
    cfg.attemptColumn,
    input.checkoutId,
    amount,
    currency,
    input.paymentMethodId,
    undefined,
    supabase,
  );

  if (attemptResult.status !== 200) {
    return attemptResult;
  }

  const paystackResult = await initiatePaystackChargeForAttempt(
    supabase,
    attemptResult.data,
    amount,
    currency,
    userEmail,
    method as unknown as SelectedPaymentMethod,
    buildCallbackUrl(input.checkoutId),
  );

  if (paystackResult.status !== 200) {
    return paystackResult;
  }

  return {
    status: 200,
    data: {
      attempt: attemptResult.data,
      paystack: paystackResult.data,
      credit: null,
      verification: null,
    },
  };
}

async function loadPaymentMethod(
  supabase: SupabaseClient<Database>,
  userId: string,
  paymentMethodId: string,
) {
  const { data, error } = await supabase
    .from("payment_method")
    .select("id, method_type, details")
    .eq("id", paymentMethodId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    logger.error(`Failed fetching payment method: ${error.message}`);
    return "error" as const;
  }
  return data;
}

/**
 * Cancels this checkout's open attempts (all of them, or only those started
 * with credit) and releases their held credit, so a new attempt starts
 * clean. Refuses while one is being finalized ('processing').
 */
async function dropOpenCreditAttempts(
  supabase: SupabaseClient<Database>,
  userId: string,
  kind: PromotionKind,
  checkoutId: string,
  { onlyCredit }: { onlyCredit: boolean },
): Promise<"ok" | { status: 409 | 500; message: string }> {
  const cfg = PROMOTION_TARGETS[kind];
  const { data: open, error } = await supabase
    .from("payment_attempt")
    .select("id, status, credit_amount")
    .eq(cfg.attemptColumn, checkoutId)
    .eq("user_id", userId)
    .in("status", ["initiated", "pending", "processing"]);

  if (error) {
    logger.error(`Failed checking open attempts: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const affected = (open ?? []).filter(
    (a) => !onlyCredit || Number(a.credit_amount) > 0,
  );
  if (affected.some((a) => a.status === "processing")) {
    return {
      status: 409,
      message:
        "A payment for this checkout is being confirmed. Wait a moment, then check its status.",
    };
  }

  if (affected.length > 0) {
    const { error: cancelError } = await supabase
      .from("payment_attempt")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in(
        "id",
        affected.map((a) => a.id),
      )
      .in("status", ["initiated", "pending"]);
    if (cancelError) {
      logger.error(`Failed cancelling open attempts: ${cancelError.message}`);
      return { status: 500, message: "Something went wrong!" };
    }
  }

  try {
    await releaseOpenReservations(cfg.targetType, checkoutId, "replaced");
  } catch {
    return { status: 500, message: "Something went wrong!" };
  }
  return "ok";
}

async function startCreditPayment(
  supabase: SupabaseClient<Database>,
  userId: string,
  userEmail: string,
  input: {
    kind: PromotionKind;
    checkoutId: string;
    paymentMethodId?: string | null;
  },
  buildCallbackUrl: (checkoutId: string) => string,
  fulfillmentDeps: PaymentFulfillmentDeps | undefined,
): Promise<CreatePromotionPaymentAttemptResult> {
  const cfg = PROMOTION_TARGETS[input.kind];

  let order: Awaited<ReturnType<typeof loadPromotionOrder>>;
  let quote: Awaited<ReturnType<typeof computePromotionCredit>>;
  try {
    order = await loadPromotionOrder(
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
    quote = await computePromotionCredit(order, userId);
  } catch {
    return { status: 500, message: "Something went wrong!" };
  }

  if (!quote.offered || quote.creditMinor === 0) {
    return {
      status: 409,
      message: "You don't have credit you can use on this promotion.",
    };
  }

  let method: Awaited<ReturnType<typeof loadPaymentMethod>> = null;
  if (!quote.creditOnly) {
    if (!input.paymentMethodId) {
      return {
        status: 400,
        message: "Choose a payment method for the rest of the amount",
      };
    }
    method = await loadPaymentMethod(supabase, userId, input.paymentMethodId);
    if (method === "error") {
      return { status: 500, message: "Something went wrong!" };
    }
    if (!method) return { status: 404, message: "Payment method not found" };
  } else if (!fulfillmentDeps) {
    // Programming error: a credit-only order is finalized right here.
    logger.error("createPromotionPaymentAttemptCore: missing fulfillmentDeps");
    return { status: 500, message: "Something went wrong!" };
  }

  const dropped = await dropOpenCreditAttempts(
    supabase,
    userId,
    input.kind,
    input.checkoutId,
    { onlyCredit: false },
  );
  if (dropped !== "ok") return dropped;

  const cashCedis = fromPesewas(quote.cashMinor);
  const { data: inserted, error: insertError } = await supabase
    .from("payment_attempt")
    .insert({
      user_id: userId,
      [cfg.attemptColumn]: input.checkoutId,
      payment_method_id: quote.creditOnly
        ? null
        : (input.paymentMethodId ?? null),
      amount: cashCedis,
      credit_amount: fromPesewas(quote.creditMinor),
      currency: quote.currency,
      status: "initiated",
      provider: quote.creditOnly ? "abonten_credit" : "paystack",
      // Credit-only orders never reach Paystack; an internal reference keeps
      // payment_attempt / transaction references unique and traceable.
      provider_reference: quote.creditOnly ? `ABNCR-${randomUUID()}` : null,
      // attemptColumn is a computed key -- the typed insert's excess-property
      // check can't be validated against it.
    } as unknown as Database["public"]["Tables"]["payment_attempt"]["Insert"])
    .select(ATTEMPT_SELECT)
    .single();

  if (insertError || !inserted) {
    logger.error(
      `Failed creating credit payment attempt: ${insertError?.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }
  const attempt = inserted as PaymentAttemptRow;

  const reserved = await reserveCredit({
    userId,
    scope: "promotions",
    targetType: cfg.targetType,
    targetId: input.checkoutId,
    paymentAttemptId: attempt.id,
    amountMinor: quote.creditMinor,
    orderTotalMinor: order.orderTotalMinor,
    expiresAt: reservationExpiry(order.expiresAt),
    label: order.label,
  });

  if (!reserved.ok) {
    await supabase
      .from("payment_attempt")
      .update({
        status: "failed",
        failure_reason: "Credit could not be reserved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);
    return { status: 409, message: reserved.message };
  }

  await supabase
    .from("payment_attempt")
    .update({ credit_reservation_id: reserved.reservationId })
    .eq("id", attempt.id);

  const credit = {
    appliedMinor: quote.creditMinor,
    cashMinor: quote.cashMinor,
  };

  if (quote.creditOnly) {
    const verification = await verifyPaystackPaymentCore(
      supabase,
      userId,
      attempt.id,
      fulfillmentDeps as PaymentFulfillmentDeps,
    );
    return {
      status: 200,
      data: { attempt, paystack: null, credit, verification },
    };
  }

  const paystackResult = await initiatePaystackChargeForAttempt(
    supabase,
    attempt,
    cashCedis,
    quote.currency,
    userEmail,
    method as unknown as SelectedPaymentMethod,
    buildCallbackUrl(input.checkoutId),
  );

  if (paystackResult.status !== 200) {
    await releaseReservation(reserved.reservationId, "payment_not_started");
    await supabase
      .from("payment_attempt")
      .update({
        status: "failed",
        failure_reason: "Payment could not be started",
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);
    return paystackResult;
  }

  return {
    status: 200,
    data: {
      attempt,
      paystack: paystackResult.data,
      credit,
      verification: null,
    },
  };
}
