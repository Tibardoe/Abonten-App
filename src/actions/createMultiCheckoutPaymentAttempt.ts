"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/config/supabase/server";
import { prepareCheckoutPayment } from "@/utils/checkoutPaymentPreparation";
import {
  type PaymentAttemptRow,
  upsertPaymentAttemptForSession,
} from "@/utils/paymentAttempt";

type CreateMultiCheckoutPaymentAttemptInput = {
  checkoutSessionIds: string[];
  paymentMethodId: string;
};

type CreateMultiCheckoutPaymentAttemptResult =
  | { status: 400 | 401 | 404 | 500; message: string }
  | {
      status: 409;
      message: string;
      invalidSessionIds: string[];
    }
  | {
      status: 200;
      data: { paymentGroupId: string; attempts: PaymentAttemptRow[] };
    };

/**
 * Pays for several pending checkout sessions (possibly across different
 * events) in one action. Mirrors createPaymentAttempt.ts's single-session
 * behavior exactly, just fanned out: for each session it still creates one
 * payment_attempt row (never merging them), all tagged with the same
 * paymentGroupId so the group is traceable as one "pay" action. It does NOT
 * complete the purchase — there is no payment gateway integrated yet, same
 * honest-stub behavior as the single-session path.
 *
 * Always re-validates against the database (never the client) right before
 * writing anything: if any selected session has expired or no longer
 * belongs to this user since it was selected, no attempt rows are created
 * at all and the caller is told which sessions need attention.
 */
export default async function createMultiCheckoutPaymentAttempt(
  input: CreateMultiCheckoutPaymentAttemptInput,
): Promise<CreateMultiCheckoutPaymentAttemptResult> {
  if (input.checkoutSessionIds.length === 0) {
    return { status: 400, message: "No checkouts selected" };
  }

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
    .select("id")
    .eq("id", input.paymentMethodId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (methodError) {
    console.log(`Failed fetching payment method: ${methodError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!method) {
    return { status: 404, message: "Payment method not found" };
  }

  let prepared: Awaited<ReturnType<typeof prepareCheckoutPayment>>;
  try {
    prepared = await prepareCheckoutPayment(user.id, input.checkoutSessionIds);
  } catch (error) {
    console.log(`Failed preparing checkout payment: ${error}`);
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
      user.id,
      "checkout_session_id",
      session.checkoutSessionId,
      session.total,
      prepared.currency,
      input.paymentMethodId,
      paymentGroupId,
    );

    if (result.status !== 200) {
      // Roll back everything already created in this group so a failed
      // multi-pay attempt never leaves a half-formed group behind.
      if (insertedAttempts.length > 0) {
        await supabase
          .from("payment_attempt")
          .update({ status: "cancelled", updated_at: new Date() })
          .in(
            "id",
            insertedAttempts.map((a) => a.id),
          );
      }
      return { status: 500, message: "Something went wrong!" };
    }

    insertedAttempts.push(result.data);
  }

  return { status: 200, data: { paymentGroupId, attempts: insertedAttempts } };
}
