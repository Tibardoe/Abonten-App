"use server";

import { createClient } from "@/config/supabase/server";
import { finalizePaystackPayment } from "@/utils/finalizePaystackPayment";
import { logger } from "@/utils/logger";

type RetryPaymentFulfillmentResult =
  | { status: 401 | 403 | 404; message: string }
  | { status: 200; data: { finalized: "succeeded" } }
  | {
      status: 202;
      data: { finalized: "pending" | "already_processing" };
      message?: string;
    }
  | {
      status: 207;
      data: { finalized: "fulfillment_failed"; paymentAttemptId: string };
      message: string;
    }
  | { status: 400; data: { finalized: "failed" }; message: string };

/**
 * User-facing recovery action for the "payment succeeded but fulfillment
 * failed" state (see finalizePaystackPayment.ts's "fulfillment_failed"
 * status). Never re-charges the user — it re-invokes the exact same
 * finalize pipeline the webhook and the initial verify step use, which
 * re-verifies with Paystack (a read, not a charge) and reuses the
 * already-recorded `transaction` row instead of creating a new one.
 */
export default async function retryPaymentFulfillment(
  paymentAttemptId: string,
): Promise<RetryPaymentFulfillmentResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("payment_attempt")
    .select("id, user_id")
    .eq("id", paymentAttemptId)
    .maybeSingle();

  if (attemptError) {
    logger.error(`Failed fetching payment attempt: ${attemptError.message}`);
    return { status: 404, message: "Payment attempt not found" };
  }

  if (!attempt) {
    return { status: 404, message: "Payment attempt not found" };
  }

  if (attempt.user_id !== user.id) {
    return { status: 403, message: "Not authorized" };
  }

  const result = await finalizePaystackPayment(supabase, paymentAttemptId);

  if (result.status === "succeeded") {
    return { status: 200, data: { finalized: "succeeded" } };
  }

  if (result.status === "pending" || result.status === "already_processing") {
    return {
      status: 202,
      data: { finalized: result.status },
      message: "message" in result ? result.message : undefined,
    };
  }

  if (result.status === "not_found") {
    return { status: 404, message: "Payment attempt not found" };
  }

  if (result.status === "fulfillment_failed") {
    return {
      status: 207,
      data: {
        finalized: "fulfillment_failed",
        paymentAttemptId: result.paymentAttemptId,
      },
      message: result.message,
    };
  }

  return {
    status: 400,
    data: { finalized: "failed" },
    message: result.message,
  };
}
