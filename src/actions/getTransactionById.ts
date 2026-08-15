"use server";

import { createClient } from "@/config/supabase/server";
import { enrichTransaction } from "./transactionEnrichment";

// Fetches a single transaction directly instead of loading the user's
// entire transaction history and finding the matching row in memory.
export async function getTransactionById(transactionId: string) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: transaction, error: transactionError } = await supabase
    .from("transaction")
    .select("*")
    .eq("id", transactionId)
    .eq("user_id", user.user.id)
    .maybeSingle();

  if (transactionError) {
    return {
      status: 500,
      message: `Error fetching transaction: ${transactionError.message}`,
    };
  }

  if (!transaction) {
    return { status: 404, message: "Transaction not found" };
  }

  const enriched = await enrichTransaction(supabase, transaction);

  return { status: 200, data: enriched };
}
