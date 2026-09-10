"use server";

import { createClient } from "@/config/supabase/server";
import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import {
  type CreatePromotionPaymentAttemptResult,
  createPromotionPaymentAttemptCore,
} from "@abonten/services/payments/createPromotionPaymentAttemptCore";

/**
 * Starts paying for a pending event or place promotion checkout — by card /
 * mobile money, partly with Abonten Credit, or entirely with credit (then
 * the promotion is activated before this returns). Same service as the
 * mobile POST /api/mobile/checkout/{promotion,place-promotion}-attempt.
 */
export async function createPromotionPaymentAttempt(input: {
  kind: "event" | "place";
  checkoutId: string;
  paymentMethodId?: string | null;
  useCredit?: boolean;
}): Promise<
  CreatePromotionPaymentAttemptResult | { status: 401; message: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const type = input.kind === "event" ? "event-promotion" : "promotion";

  return createPromotionPaymentAttemptCore(
    supabase,
    user.id,
    user.email,
    {
      kind: input.kind,
      checkoutId: input.checkoutId,
      paymentMethodId: input.paymentMethodId ?? null,
      useCredit: input.useCredit === true,
    },
    (id) => `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/${id}?type=${type}`,
    paymentFulfillmentDeps,
  );
}
