"use server";

import { createClient } from "@/config/supabase/server";
import { refundTransaction } from "@/services/paystackService";

/**
 * Refunds a transaction via Paystack and marks it `refunded`. Takes only an
 * id (not a caller-supplied transaction object) and re-fetches + re-checks
 * ownership/status itself — this is a directly-callable Server Action, so it
 * can't trust that a caller already verified those things, even though
 * cancelUserTicket.ts (its only current caller) already did.
 */
export default async function issueRefund(transactionId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: transaction, error: transactionError } = await supabase
    .from("transaction")
    .select("id, status, paystack_reference")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (transactionError || !transaction) {
    console.log(
      `Failed fetching transaction for refund: ${transactionError?.message}`,
    );
    return { status: 404, message: "Transaction not found" };
  }

  if (transaction.status === "refunded") {
    return { status: 200, message: "This payment was already refunded" };
  }

  if (transaction.status !== "successful") {
    return {
      status: 400,
      message: "Only successful payments can be refunded",
    };
  }

  if (!transaction.paystack_reference) {
    return { status: 400, message: "No payment reference on this transaction" };
  }

  try {
    await refundTransaction(transaction.paystack_reference);
  } catch (error) {
    console.log(`Refund failed for transaction ${transaction.id}: ${error}`);
    return {
      status: 500,
      message: "Refund could not be processed. Please contact support.",
    };
  }

  const { error: updateError } = await supabase
    .from("transaction")
    .update({ status: "refunded", updated_at: new Date() })
    .eq("id", transaction.id);

  if (updateError) {
    console.log(`Failed marking transaction refunded: ${updateError.message}`);
    return {
      status: 500,
      message:
        "Refund was processed but couldn't be recorded. Please contact support.",
    };
  }

  return { status: 200, message: "Refund successful" };
}
