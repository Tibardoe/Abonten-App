import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import { prepareCheckoutPayment } from "@abonten/services/checkout/checkoutPaymentPreparation";
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

// Post-auth body of createMultiCheckoutPaymentAttempt, lifted so the mobile
// route (`/api/mobile/checkout/attempt`) runs the exact same logic — see
// src/actions/createMultiCheckoutPaymentAttempt.ts. Caller supplies an
// already-authenticated Supabase client, the resolved userId + email, and
// `callbackUrlFor` which turns the primary checkout session id into a
// Paystack callback URL (a web checkout page URL on web; an `abonten://`
// deep link on mobile) — called with the first *valid* session id, exactly
// as the original action did. Deliberately NOT a "use server" file (see
// ticketInventory.ts).

export type PaystackPaymentInfo =
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

export type CreateMultiCheckoutPaymentAttemptCoreResult =
  | { status: 400 | 404 | 500; message: string }
  | { status: 409; message: string; invalidSessionIds: string[] }
  | {
      status: 200;
      data: {
        paymentGroupId: string;
        attempts: PaymentAttemptRow[];
        paystack: PaystackPaymentInfo;
      };
    };

export async function createMultiCheckoutPaymentAttemptCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  userEmail: string | undefined,
  input: { checkoutSessionIds: string[]; paymentMethodId: string },
  callbackUrlFor: (checkoutSessionId: string) => string,
): Promise<CreateMultiCheckoutPaymentAttemptCoreResult> {
  if (input.checkoutSessionIds.length === 0) {
    return { status: 400, message: "No checkouts selected" };
  }

  const { data: method, error: methodError } = await supabase
    .from("payment_method")
    .select("id, method_type, details")
    .eq("id", input.paymentMethodId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (methodError) {
    logger.error(`Failed fetching payment method: ${methodError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!method) {
    return { status: 404, message: "Payment method not found" };
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
      supabase,
    );

    if (result.status !== 200) {
      // Roll back everything already created in this group so a failed
      // multi-pay attempt never leaves a half-formed group behind.
      if (insertedAttempts.length > 0) {
        await supabase
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

  // Only the group's first (primary) attempt row is initialized with
  // Paystack — one Paystack transaction covers the whole group's grand
  // total, rather than opening a separate popup per checkout session.
  // finalizePaystackPayment.ts fans a successful verification back out to
  // every member sharing this paymentGroupId.
  const primary = insertedAttempts[0];
  const paystackResult = await initiatePaystackChargeForAttempt(
    supabase,
    primary,
    prepared.grandTotal,
    prepared.currency,
    userEmail,
    method as unknown as SelectedPaymentMethod,
    callbackUrlFor(prepared.validSessions[0].checkoutSessionId),
  );

  if (paystackResult.status !== 200) {
    await supabase
      .from("payment_attempt")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in(
        "id",
        insertedAttempts.map((a) => a.id),
      );
    return paystackResult;
  }

  return {
    status: 200,
    data: {
      paymentGroupId,
      attempts: insertedAttempts,
      paystack: paystackResult.data,
    },
  };
}
