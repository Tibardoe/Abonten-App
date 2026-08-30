"use server";

import { createClient } from "@/config/supabase/server";
import { computeCheckoutFee } from "@/utils/checkoutPricing";
import { logger } from "@/utils/logger";
import {
  type PaymentAttemptRow,
  upsertPaymentAttemptForSession,
} from "@/utils/paymentAttempt";
import {
  type SelectedPaymentMethod,
  initiatePaystackChargeForAttempt,
} from "@/utils/paystackInit";
import { getActiveServiceFeeRate } from "@/utils/platformFee";

export type { PaymentAttemptRow };

type CreatePaymentAttemptInput = {
  paymentMethodId: string;
} & (
  | { checkoutSessionId: string }
  | { placePromotionCheckoutId: string }
  | { eventPromotionCheckoutId: string }
);

type PaystackPaymentInfo =
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

type CreatePaymentAttemptResult =
  | { status: 400 | 401 | 404 | 410 | 500; message: string }
  | {
      status: 200;
      data: PaymentAttemptRow & { paystack: PaystackPaymentInfo };
    };

type TicketCheckoutLine = {
  total_price: number;
  ticket_type: { currency: string } | null;
};

/**
 * Records that the user has chosen a saved payment method to pay for a
 * still-pending checkout — it does NOT complete the purchase. There is no
 * payment gateway integrated yet, so this deliberately leaves the attempt at
 * 'initiated' rather than faking a 'succeeded' result; a future gateway
 * webhook/verify step is what should ever move an attempt to 'succeeded' and
 * then call generateTicket/activateEventPromotion/activatePlacePromotion.
 * Retrying with the same
 * method reuses the still-open attempt instead of spawning duplicates;
 * switching methods cancels the old attempt and opens a new one.
 */
export default async function createPaymentAttempt(
  input: CreatePaymentAttemptInput,
): Promise<CreatePaymentAttemptResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: method, error: methodError } = await supabase
    .from("payment_method")
    .select("id, method_type, details")
    .eq("id", input.paymentMethodId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (methodError) {
    logger.error(`Failed fetching payment method: ${methodError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!method) {
    return { status: 404, message: "Payment method not found" };
  }

  if (!user.email) {
    return {
      status: 400,
      message: "Your account needs a verified email to pay",
    };
  }

  let amount: number;
  let currency: string;
  let matchColumn:
    | "checkout_session_id"
    | "place_promotion_checkout_id"
    | "event_promotion_checkout_id";
  let matchValue: string;
  let callbackPath: string;

  if ("checkoutSessionId" in input) {
    await supabase.rpc("expire_stale_ticket_checkouts");

    const { data: rows, error: checkoutError } = await supabase
      .from("ticket_checkout")
      .select("total_price, ticket_type:ticket_type_id(currency)")
      .eq("checkout_session_id", input.checkoutSessionId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (checkoutError) {
      logger.error(`Failed fetching checkout: ${checkoutError.message}`);
      return { status: 500, message: "Something went wrong!" };
    }

    const lines = (rows ?? []) as unknown as TicketCheckoutLine[];

    if (lines.length === 0) {
      return {
        status: 410,
        message: "This checkout has expired. Please start again.",
      };
    }

    const ticketAmount = lines.reduce((sum, line) => sum + line.total_price, 0);
    currency = lines[0].ticket_type?.currency ?? "GHS";
    // The customer-paid Abonten service fee, on top of the (already
    // discounted) ticket total — the organizer still receives 100% of the
    // ticket price. Rate comes from platform_fee_config (single source of
    // truth); the same shared computeCheckoutFee is used by CheckoutModal.tsx's
    // preview so the two can't drift apart.
    const feeRate = await getActiveServiceFeeRate(supabase, currency);
    amount = ticketAmount + computeCheckoutFee(ticketAmount, feeRate);
    matchColumn = "checkout_session_id";
    matchValue = input.checkoutSessionId;
    callbackPath = `/checkout/${input.checkoutSessionId}?type=ticket`;
  } else if ("placePromotionCheckoutId" in input) {
    await supabase.rpc("expire_stale_place_promotion_checkouts");

    const { data: checkout, error: checkoutError } = await supabase
      .from("place_promotion_checkout")
      .select("total_price, currency")
      .eq("id", input.placePromotionCheckoutId)
      .eq("owner_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (checkoutError) {
      logger.error(`Failed fetching checkout: ${checkoutError.message}`);
      return { status: 500, message: "Something went wrong!" };
    }

    if (!checkout) {
      return {
        status: 410,
        message: "This checkout has expired. Please start again.",
      };
    }

    amount = checkout.total_price;
    currency = checkout.currency;
    matchColumn = "place_promotion_checkout_id";
    matchValue = input.placePromotionCheckoutId;
    callbackPath = `/checkout/${input.placePromotionCheckoutId}?type=promotion`;
  } else {
    await supabase.rpc("expire_stale_event_promotion_checkouts");

    const { data: checkout, error: checkoutError } = await supabase
      .from("event_promotion_checkout")
      .select("total_price, currency")
      .eq("id", input.eventPromotionCheckoutId)
      .eq("owner_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (checkoutError) {
      logger.error(`Failed fetching checkout: ${checkoutError.message}`);
      return { status: 500, message: "Something went wrong!" };
    }

    if (!checkout) {
      return {
        status: 410,
        message: "This checkout has expired. Please start again.",
      };
    }

    amount = checkout.total_price;
    currency = checkout.currency;
    matchColumn = "event_promotion_checkout_id";
    matchValue = input.eventPromotionCheckoutId;
    callbackPath = `/checkout/${input.eventPromotionCheckoutId}?type=event-promotion`;
  }

  const attemptResult = await upsertPaymentAttemptForSession(
    user.id,
    matchColumn,
    matchValue,
    amount,
    currency,
    input.paymentMethodId,
  );

  if (attemptResult.status !== 200) {
    return attemptResult;
  }

  const paystackResult = await initiatePaystackChargeForAttempt(
    supabase,
    attemptResult.data,
    amount,
    currency,
    user.email,
    method as unknown as SelectedPaymentMethod,
    `${process.env.NEXT_PUBLIC_BASE_URL}${callbackPath}`,
  );

  if (paystackResult.status !== 200) {
    return paystackResult;
  }

  return {
    status: 200,
    data: { ...attemptResult.data, paystack: paystackResult.data },
  };
}
