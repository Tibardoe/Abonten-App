import {
  type PaymentAttemptRow,
  upsertPaymentAttemptForSession,
} from "@/utils/paymentAttempt";
import {
  type SelectedPaymentMethod,
  initiatePaystackChargeForAttempt,
} from "@/utils/paystackInit";
import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of the event/place-promotion branches of createPaymentAttempt,
// lifted so the mobile POST /api/mobile/checkout/promotion-attempt route can
// start a promotion payment with a Bearer session. It runs the same steps
// createPaymentAttempt's promotion branches run — payment-method fetch, the
// stale-checkout sweep, the owner-scoped checkout read for the authoritative
// amount, upsertPaymentAttemptForSession, initiatePaystackChargeForAttempt.
//
// The web createPaymentAttempt Server Action is deliberately left untouched
// (it is a live money path); this is a focused, standalone re-implementation
// of only the ~40 lines it needs, against the same stable promotion-checkout
// schema. Deliberately NOT a "use server" file.

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
  | { status: 400 | 404 | 410 | 500; message: string }
  | {
      status: 200;
      data: { attempt: PaymentAttemptRow; paystack: PromotionPaystackInfo };
    };

type PromotionKind = "event" | "place";

const CONFIG: Record<
  PromotionKind,
  {
    table: "event_promotion_checkout" | "place_promotion_checkout";
    sweepRpc:
      | "expire_stale_event_promotion_checkouts"
      | "expire_stale_place_promotion_checkouts";
    column: "event_promotion_checkout_id" | "place_promotion_checkout_id";
  }
> = {
  event: {
    table: "event_promotion_checkout",
    sweepRpc: "expire_stale_event_promotion_checkouts",
    column: "event_promotion_checkout_id",
  },
  place: {
    table: "place_promotion_checkout",
    sweepRpc: "expire_stale_place_promotion_checkouts",
    column: "place_promotion_checkout_id",
  },
};

export async function createPromotionPaymentAttemptCore(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  input: {
    kind: PromotionKind;
    checkoutId: string;
    paymentMethodId: string;
  },
  buildCallbackUrl: (checkoutId: string) => string,
): Promise<CreatePromotionPaymentAttemptResult> {
  const cfg = CONFIG[input.kind];

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

  await supabase.rpc(cfg.sweepRpc);

  const { data: checkout, error: checkoutError } = await supabase
    .from(cfg.table)
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

  const amount = checkout.total_price as number;
  const currency = checkout.currency as string;

  const attemptResult = await upsertPaymentAttemptForSession(
    userId,
    cfg.column,
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
    data: { attempt: attemptResult.data, paystack: paystackResult.data },
  };
}
