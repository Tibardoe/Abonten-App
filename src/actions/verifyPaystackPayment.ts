"use server";

import { createClient } from "@/config/supabase/server";
import { finalizePaystackPayment } from "@/utils/finalizePaystackPayment";

type VerifyPaystackPaymentResult =
  | { status: 401 | 403 | 404; message: string }
  | { status: 200; data: { finalized: "succeeded" } }
  | {
      status: 202;
      data: { finalized: "pending" | "already_processing" };
      message?: string;
    }
  | { status: 400; data: { finalized: "failed" }; message: string };

/**
 * Optimistic, client-triggered verification step, called right after the
 * Paystack popup reports success — this is a fast path for UI feedback
 * only, never the sole source of truth. It calls the exact same
 * finalizePaystackPayment() the webhook calls, so whichever of the two
 * "wins" the race does the real work, and the other is a no-op.
 */
export default async function verifyPaystackPayment(
  paymentAttemptId: string,
): Promise<VerifyPaystackPaymentResult> {
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
    console.log(`Failed fetching payment attempt: ${attemptError.message}`);
    return { status: 404, message: "Payment attempt not found" };
  }

  if (!attempt) {
    return { status: 404, message: "Payment attempt not found" };
  }

  // Ownership check — a user can only ever trigger verification of their
  // own payment attempt, never someone else's by guessing an id.
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

  return {
    status: 400,
    data: { finalized: "failed" },
    message: result.message,
  };
}
