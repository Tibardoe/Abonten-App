import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import type { ClientPlatform } from "@abonten/core/market/types";
import { money, toMajor } from "@abonten/core/money/money";
import { apportionCredit } from "@abonten/core/rewards/creditAllocation";
import {
  MixedMarketCheckoutError,
  prepareCheckoutPayment,
} from "@abonten/services/checkout/checkoutPaymentPreparation";
import { initiateChargeForAttempt } from "@abonten/services/payments/chargeInit";
import {
  type PaymentAttemptRow,
  upsertPaymentAttemptForSession,
} from "@abonten/services/payments/paymentAttempt";
import {
  marketClosedForSales,
  resolvePaymentChoice,
} from "@abonten/services/payments/paymentChoice";
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
    /** A saved instrument, or `method` below. Not needed when credit covers everything. */
    paymentMethodId?: string | null;
    /** Pay with this method on the provider's page instead ("card", "bank_transfer"…). */
    method?: string | null;
    platform?: ClientPlatform | null;
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
    if (error instanceof MixedMarketCheckoutError) {
      return {
        status: 409,
        message:
          "These tickets are sold in different countries or currencies. Pay for them separately.",
        invalidSessionIds: [],
      };
    }
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

  // The event's market and currency decide what can pay for it; the
  // client's choice is checked against that, never trusted.
  const resolvedChoice = await resolvePaymentChoice(supabase, userId, input, {
    countryCode: prepared.countryCode,
    currency: prepared.currency,
  });
  if (!resolvedChoice.ok) {
    return resolvedChoice.status === 409
      ? { status: 409, message: resolvedChoice.message, invalidSessionIds: [] }
      : { status: resolvedChoice.status, message: resolvedChoice.message };
  }
  const choice = resolvedChoice.choice;

  // Switching from a credit payment back to cash: an open attempt started
  // with credit must not be reused (it would charge only the cash part).
  const switched = await dropOpenAttempts(
    userId,
    prepared.validSessions.map((s) => s.checkoutSessionId),
    { onlyCredit: true },
  );
  if (switched !== "ok") return withNoInvalidSessions(switched);

  // The provider that will charge this order: the event's market and
  // currency decide it, never the client (paymentChoice above).
  const providerCode = choice.providerCode;

  const service = getSupabaseServiceClient();
  const cancel = (ids: string[]) =>
    service
      .from("payment_attempt")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in("id", ids)
      .in("status", ["initiated", "pending"]);

  // Twice at most: a first pass can find an attempt that was started for
  // another charge (the basket or price changed since); chargeInit retires
  // it and the second pass starts everything fresh.
  for (let pass = 0; pass < 2; pass++) {
    const paymentGroupId = randomUUID();
    const insertedAttempts: PaymentAttemptRow[] = [];

    for (const session of prepared.validSessions) {
      const result = await upsertPaymentAttemptForSession(
        userId,
        "checkout_session_id",
        session.checkoutSessionId,
        session.total,
        prepared.currency,
        choice.paymentMethodId,
        paymentGroupId,
        { countryCode: prepared.countryCode, provider: providerCode },
        { taxMinor: session.taxMinor, method: choice.methodCode },
      );

      if (result.status !== 200) {
        // Roll back everything already created in this group so a failed
        // multi-pay attempt never leaves a half-formed group behind.
        if (insertedAttempts.length > 0) {
          await cancel(insertedAttempts.map((a) => a.id));
        }
        return result.status === 409
          ? { status: 409, message: result.message, invalidSessionIds: [] }
          : { status: 500, message: "Something went wrong!" };
      }

      insertedAttempts.push(result.data);
    }

    // Only the group's primary attempt is charged — one charge covers the
    // whole group's grand total; finalizePayment fans a verified payment out
    // to every member. A member that already started a charge of its own
    // (an earlier order of just that session) may only be the primary: as a
    // plain member its live reference would, once paid, finalize this whole
    // group against the wrong amount — or, after the group succeeded, be
    // kept without a refund. So it leads, and any second one is retired.
    const started = insertedAttempts.filter((a) => a.provider_reference);
    if (started.length > 1) {
      await cancel(insertedAttempts.map((a) => a.id));
      continue;
    }
    const primary = started[0] ?? insertedAttempts[0];
    const attempts = [
      primary,
      ...insertedAttempts.filter((a) => a.id !== primary.id),
    ];
    // insertedAttempts[i] belongs to validSessions[i].
    const primarySession =
      prepared.validSessions[insertedAttempts.indexOf(primary)];

    const chargeResult = await initiateChargeForAttempt({
      attempt: primary,
      amount: money(prepared.grandTotalMinor, prepared.currency),
      countryCode: prepared.countryCode,
      email: userEmail,
      paymentMethod: choice.saved,
      methodCode: choice.methodCode,
      providerCode: choice.providerCode,
      callbackUrl: callbackUrlFor(primarySession.checkoutSessionId),
      description:
        prepared.validSessions.length === 1
          ? `Tickets · ${prepared.validSessions[0].eventTitle}`
          : `Tickets for ${prepared.validSessions.length} events`,
    });

    if (chargeResult.status !== 200) {
      await cancel(insertedAttempts.map((a) => a.id));
      if (chargeResult.status === 409 && pass === 0) continue;
      return chargeResult.status === 409
        ? {
            status: 409,
            message: chargeResult.message,
            invalidSessionIds: [],
          }
        : chargeResult;
    }

    return {
      status: 200,
      data: {
        paymentGroupId,
        attempts,
        payment: chargeResult.data,
        credit: null,
        verification: null,
      },
    };
  }
  return {
    status: 409,
    message:
      "This order changed since its payment was started. Please try again.",
    invalidSessionIds: [],
  };
}

async function startCreditPayment(
  supabase: SupabaseClient<Database>,
  userId: string,
  userEmail: string,
  input: {
    paymentMethodId?: string | null;
    method?: string | null;
    platform?: ClientPlatform | null;
  },
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

  // The cash part (if any) goes through the event market's provider, by a
  // method that market can complete; a credit-only order still needs the
  // market to be taking sales.
  let choice:
    | Extract<
        Awaited<ReturnType<typeof resolvePaymentChoice>>,
        { ok: true }
      >["choice"]
    | null = null;
  if (!quote.creditOnly) {
    if (!input.paymentMethodId && !input.method) {
      return {
        status: 400,
        message: "Choose a payment method for the rest of the amount",
      };
    }
    const resolvedChoice = await resolvePaymentChoice(supabase, userId, input, {
      countryCode: prepared.countryCode,
      currency: quote.currency,
    });
    if (!resolvedChoice.ok) {
      return resolvedChoice.status === 409
        ? {
            status: 409,
            message: resolvedChoice.message,
            invalidSessionIds: [],
          }
        : { status: resolvedChoice.status, message: resolvedChoice.message };
    }
    choice = resolvedChoice.choice;
  } else {
    const closed = await marketClosedForSales(prepared.countryCode);
    if (closed) return { ...closed, invalidSessionIds: [] };
  }
  if (quote.creditOnly && !fulfillmentDeps) {
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

  const cashProvider = choice?.providerCode ?? "abonten_credit";

  const paymentGroupId = randomUUID();
  const creditShares = apportionCredit(
    quote.creditMinor,
    order.sessions.map((s) => s.totalMinor),
  );
  const service = getSupabaseServiceClient();

  const rows = order.sessions.map((session, index) => ({
    user_id: userId,
    checkout_session_id: session.checkoutSessionId,
    payment_method_id: choice?.paymentMethodId ?? null,
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
    paymentMethod: choice?.saved ?? null,
    methodCode: choice?.methodCode ?? "card",
    providerCode: choice?.providerCode ?? null,
    callbackUrl: callbackUrlFor(order.sessions[0].checkoutSessionId),
    description: order.label,
  });

  if (chargeResult.status !== 200) {
    await releaseReservation(reserved.reservationId, "payment_not_started");
    await failGroup("Payment could not be started");
    return chargeResult.status === 409
      ? { status: 409, message: chargeResult.message, invalidSessionIds: [] }
      : chargeResult;
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
