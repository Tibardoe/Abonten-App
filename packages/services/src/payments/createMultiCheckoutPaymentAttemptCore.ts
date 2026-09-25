import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import { money, toMajor } from "@abonten/core/money/money";
import { apportionCredit } from "@abonten/core/rewards/creditAllocation";
import { prepareCheckoutPayment } from "@abonten/services/checkout/checkoutPaymentPreparation";
import {
  type SelectedPaymentMethod,
  initiateChargeForAttempt,
} from "@abonten/services/payments/chargeInit";
import {
  type PaymentAttemptRow,
  upsertPaymentAttemptForSession,
} from "@abonten/services/payments/paymentAttempt";
import { resolveProviderAccount } from "@abonten/services/payments/providers/registry";
import type { CheckoutInit } from "@abonten/services/payments/providers/types";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  releaseOpenReservations,
  releaseReservation,
  reservationExpiry,
  reserveCredit,
} from "../rewards/creditRedemptionCore";
import { quoteTicketCredit } from "../rewards/ticketCreditCore";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import type { PaymentFulfillmentDeps } from "./fulfillmentDeps";
import {
  type VerifyPaymentCoreResult,
  verifyPaymentCore,
} from "./verifyPaymentCore";

// Post-auth body of createMultiCheckoutPaymentAttempt, lifted so the mobile
// route (`/api/mobile/checkout/attempt`) runs the exact same logic — see
// src/actions/createMultiCheckoutPaymentAttempt.ts. Caller supplies an
// already-authenticated Supabase client, the resolved userId + email, and
// `callbackUrlFor` which turns the primary checkout session id into a
// provider callback URL (a web checkout page URL on web; an `abonten://`
// deep link on mobile) — called with the first *valid* session id.
// Deliberately NOT a "use server" file (see ticketInventory.ts).
//
// With `useCredit`, Abonten Credit pays for part of the order (the market's
// provider charges the rest) or -- when the program allows it -- all of it. The
// credit is reserved against the payment group and captured by
// finalizePayment once the purchase is confirmed; each attempt row
// records its own cash (`amount`) and credit (`credit_amount`) share.
// payment_attempt is written with the service-role client (clients can't
// write it); every query is scoped to the caller's userId.

export type CreateMultiCheckoutPaymentAttemptCoreResult =
  | { status: 400 | 404 | 500 | 503; message: string }
  | { status: 409; message: string; invalidSessionIds: string[] }
  | {
      status: 200;
      data: {
        paymentGroupId: string;
        attempts: PaymentAttemptRow[];
        /** null when credit paid for everything. */
        payment: CheckoutInit | null;
        credit: { appliedMinor: number; cashMinor: number } | null;
        /** Credit-only orders are finalized immediately; this is the outcome. */
        verification: VerifyPaymentCoreResult | null;
      };
    };

const ATTEMPT_SELECT =
  "id, provider, country_code, status, amount, currency, payment_method_id, provider_reference, metadata";

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
 * Cancels the open attempts on these sessions (all of them, or only those
 * started with credit) and gives their held credit back, so a new attempt
 * starts clean. Refuses while one is being finalized ('processing').
 */
async function dropOpenAttempts(
  userId: string,
  checkoutSessionIds: string[],
  { onlyCredit }: { onlyCredit: boolean },
): Promise<"ok" | { status: 409 | 500; message: string }> {
  const service = getSupabaseServiceClient();
  const { data: open, error } = await service
    .from("payment_attempt")
    .select("id, status, credit_amount, payment_group_id")
    .in("checkout_session_id", checkoutSessionIds)
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
        "A payment for this order is being confirmed. Wait a moment, then check its status.",
    };
  }
  if (affected.length === 0) return "ok";

  const { error: cancelError } = await service
    .from("payment_attempt")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .in(
      "id",
      affected.map((a) => a.id),
    )
    .eq("user_id", userId)
    .in("status", ["initiated", "pending"]);
  if (cancelError) {
    logger.error(`Failed cancelling open attempts: ${cancelError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const groups = Array.from(
    new Set(
      affected.map((a) => a.payment_group_id).filter((g): g is string => !!g),
    ),
  );
  try {
    for (const group of groups) {
      await releaseOpenReservations("ticket_payment_group", group, "replaced");
    }
  } catch {
    return { status: 500, message: "Something went wrong!" };
  }
  return "ok";
}

function withNoInvalidSessions(result: {
  status: 409 | 500;
  message: string;
}): CreateMultiCheckoutPaymentAttemptCoreResult {
  return result.status === 409
    ? { status: 409, message: result.message, invalidSessionIds: [] }
    : { status: 500, message: result.message };
}

export async function createMultiCheckoutPaymentAttemptCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  userEmail: string | undefined,
  input: {
    checkoutSessionIds: string[];
    /** Required unless credit covers the whole order. */
    paymentMethodId?: string | null;
    useCredit?: boolean;
  },
  callbackUrlFor: (checkoutSessionId: string) => string,
  fulfillmentDeps?: PaymentFulfillmentDeps,
): Promise<CreateMultiCheckoutPaymentAttemptCoreResult> {
  if (input.checkoutSessionIds.length === 0) {
    return { status: 400, message: "No checkouts selected" };
  }

  if (!userEmail) {
    return {
      status: 400,
      message: "Your account needs a verified email to pay",
    };
  }

  let prepared: Awaited<ReturnType<typeof prepareCheckoutPayment>>;
  try {
    prepared = await prepareCheckoutPayment(
      userId,
      input.checkoutSessionIds,
      supabase,
    );
  } catch (error) {
    logger.error(`Failed preparing checkout payment: ${error}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (prepared.invalidSessionIds.length > 0) {
    return {
      status: 409,
      message:
        "One of your selected checkouts has expired. Please review your order.",
      invalidSessionIds: prepared.invalidSessionIds,
    };
  }

  if (input.useCredit) {
    return startCreditPayment(
      supabase,
      userId,
      userEmail,
      input,
      prepared,
      callbackUrlFor,
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

  // Switching from a credit payment back to cash: an open attempt started
  // with credit must not be reused (it would charge only the cash part).
  const switched = await dropOpenAttempts(
    userId,
    prepared.validSessions.map((s) => s.checkoutSessionId),
    { onlyCredit: true },
  );
  if (switched !== "ok") return withNoInvalidSessions(switched);

  // The provider that will charge this order: the event's market and
  // currency decide it, never the client. Resolved once, before any row is
  // written, so an unconfigured market fails cleanly.
  let providerCode: string;
  try {
    providerCode = (
      await resolveProviderAccount({
        countryCode: prepared.countryCode,
        currency: prepared.currency,
        method: method.method_type === "momo" ? "mobile_money" : "card",
      })
    ).provider.code;
  } catch (error) {
    logger.error(
      `createMultiCheckoutPaymentAttemptCore: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      status: 400,
      message:
        "This payment method isn't available for this event's market. Choose another.",
    };
  }

  const paymentGroupId = randomUUID();
  const insertedAttempts: PaymentAttemptRow[] = [];

  for (const session of prepared.validSessions) {
    const result = await upsertPaymentAttemptForSession(
      userId,
      "checkout_session_id",
      session.checkoutSessionId,
      session.total,
      prepared.currency,
      input.paymentMethodId,
      paymentGroupId,
      { countryCode: prepared.countryCode, provider: providerCode },
      { taxMinor: session.taxMinor },
    );

    if (result.status !== 200) {
      // Roll back everything already created in this group so a failed
      // multi-pay attempt never leaves a half-formed group behind.
      if (insertedAttempts.length > 0) {
        await getSupabaseServiceClient()
          .from("payment_attempt")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .in(
            "id",
            insertedAttempts.map((a) => a.id),
          );
      }
      return { status: 500, message: "Something went wrong!" };
    }

    insertedAttempts.push(result.data);
  }

  // Only the group's first (primary) attempt row is initialized with the
  // provider — one charge covers the whole group's grand total, rather than
  // opening a separate popup per checkout session. finalizePayment fans a
  // successful verification back out to every member sharing this group.
  const primary = insertedAttempts[0];
  const chargeResult = await initiateChargeForAttempt({
    attempt: primary,
    amount: money(prepared.grandTotalMinor, prepared.currency),
    countryCode: prepared.countryCode,
    email: userEmail,
    paymentMethod: method as unknown as SelectedPaymentMethod,
    callbackUrl: callbackUrlFor(prepared.validSessions[0].checkoutSessionId),
    description:
      prepared.validSessions.length === 1
        ? `Tickets · ${prepared.validSessions[0].eventTitle}`
        : `Tickets for ${prepared.validSessions.length} events`,
  });

  if (chargeResult.status !== 200) {
    await getSupabaseServiceClient()
      .from("payment_attempt")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in(
        "id",
        insertedAttempts.map((a) => a.id),
      );
    return chargeResult;
  }

  return {
    status: 200,
    data: {
      paymentGroupId,
      attempts: insertedAttempts,
      payment: chargeResult.data,
      credit: null,
      verification: null,
    },
  };
}

async function startCreditPayment(
  supabase: SupabaseClient<Database>,
  userId: string,
  userEmail: string,
  input: { paymentMethodId?: string | null },
  prepared: Awaited<ReturnType<typeof prepareCheckoutPayment>>,
  callbackUrlFor: (checkoutSessionId: string) => string,
  fulfillmentDeps: PaymentFulfillmentDeps | undefined,
): Promise<CreateMultiCheckoutPaymentAttemptCoreResult> {
  let quoted: Awaited<ReturnType<typeof quoteTicketCredit>>;
  try {
    quoted = await quoteTicketCredit(supabase, userId, prepared);
  } catch {
    return { status: 500, message: "Something went wrong!" };
  }
  const { quote, order } = quoted;

  if (!quote.offered || quote.creditMinor === 0) {
    return {
      status: 409,
      message:
        quote.blockedReason === "own_event"
          ? "Credit can't be used on tickets to your own event."
          : "You don't have credit you can use on these tickets.",
      invalidSessionIds: [],
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
    logger.error(
      "createMultiCheckoutPaymentAttemptCore: missing fulfillmentDeps",
    );
    return { status: 500, message: "Something went wrong!" };
  }

  const dropped = await dropOpenAttempts(
    userId,
    order.sessions.map((s) => s.checkoutSessionId),
    { onlyCredit: false },
  );
  if (dropped !== "ok") return withNoInvalidSessions(dropped);

  // The cash part (if any) goes through the event market's provider.
  let cashProvider = "abonten_credit";
  if (!quote.creditOnly) {
    try {
      cashProvider = (
        await resolveProviderAccount({
          countryCode: prepared.countryCode,
          currency: quote.currency,
          method: method?.method_type === "momo" ? "mobile_money" : "card",
        })
      ).provider.code;
    } catch (error) {
      logger.error(
        `createMultiCheckoutPaymentAttemptCore: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        status: 400,
        message:
          "This payment method isn't available for this event's market. Choose another.",
      };
    }
  }

  const paymentGroupId = randomUUID();
  const creditShares = apportionCredit(
    quote.creditMinor,
    order.sessions.map((s) => s.totalMinor),
  );
  const service = getSupabaseServiceClient();

  const rows = order.sessions.map((session, index) => ({
    user_id: userId,
    checkout_session_id: session.checkoutSessionId,
    payment_method_id: quote.creditOnly
      ? null
      : (input.paymentMethodId ?? null),
    amount: toMajor(
      money(session.totalMinor - creditShares[index], quote.currency),
    ),
    credit_amount: toMajor(money(creditShares[index], quote.currency)),
    currency: quote.currency,
    country_code: prepared.countryCode,
    metadata: session.taxMinor ? { tax_minor: session.taxMinor } : null,
    status: "initiated",
    provider: quote.creditOnly ? "abonten_credit" : cashProvider,
    // Credit-only orders never reach Paystack; the primary row gets an
    // internal reference so payment_attempt / transaction stay traceable.
    provider_reference:
      quote.creditOnly && index === 0 ? `ABNCR-${randomUUID()}` : null,
    payment_group_id: paymentGroupId,
  }));

  const { data: inserted, error: insertError } = await service
    .from("payment_attempt")
    .insert(rows)
    .select(`${ATTEMPT_SELECT}, checkout_session_id`);

  if (insertError || !inserted || inserted.length !== rows.length) {
    logger.error(
      `Failed creating credit ticket attempts: ${insertError?.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  // Keep the attempts in session order so the first is the primary.
  const bySession = new Map(inserted.map((a) => [a.checkout_session_id, a]));
  const attempts = order.sessions.map(
    (s) => bySession.get(s.checkoutSessionId) as unknown as PaymentAttemptRow,
  );
  const primary = attempts[0];

  const failGroup = async (reason: string) => {
    await service
      .from("payment_attempt")
      .update({
        status: "failed",
        failure_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .in(
        "id",
        attempts.map((a) => a.id),
      );
  };

  const reserved = await reserveCredit({
    userId,
    scope: "tickets",
    targetType: "ticket_payment_group",
    targetId: paymentGroupId,
    paymentAttemptId: primary.id,
    amountMinor: quote.creditMinor,
    orderTotalMinor: order.orderTotalMinor,
    expiresAt: reservationExpiry(order.earliestExpiry),
    label: order.label,
  });

  if (!reserved.ok) {
    await failGroup("Credit could not be reserved");
    return { status: 409, message: reserved.message, invalidSessionIds: [] };
  }

  await service
    .from("payment_attempt")
    .update({ credit_reservation_id: reserved.reservationId })
    .eq("id", primary.id);

  const credit = {
    appliedMinor: quote.creditMinor,
    cashMinor: quote.cashMinor,
  };

  if (quote.creditOnly) {
    const verification = await verifyPaymentCore(
      supabase,
      userId,
      primary.id,
      fulfillmentDeps as PaymentFulfillmentDeps,
    );
    return {
      status: 200,
      data: { paymentGroupId, attempts, payment: null, credit, verification },
    };
  }

  const chargeResult = await initiateChargeForAttempt({
    attempt: primary,
    amount: money(quote.cashMinor, quote.currency),
    countryCode: prepared.countryCode,
    email: userEmail,
    paymentMethod: method as unknown as SelectedPaymentMethod,
    callbackUrl: callbackUrlFor(order.sessions[0].checkoutSessionId),
    description: order.label,
  });

  if (chargeResult.status !== 200) {
    await releaseReservation(reserved.reservationId, "payment_not_started");
    await failGroup("Payment could not be started");
    return chargeResult;
  }

  return {
    status: 200,
    data: {
      paymentGroupId,
      attempts,
      payment: chargeResult.data,
      credit,
      verification: null,
    },
  };
}
