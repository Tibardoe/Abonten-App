"use server";

import { createClient } from "@/config/supabase/server";
import { enrichTransactions } from "./transactionEnrichment";

export async function getUserTransactions() {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message} `,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: transactions, error: transactionsError } = await supabase
    .from("transaction")
    .select("*")
    .eq("user_id", user.user.id)
    .order("created_at", { ascending: false })
    // Safety cap: no pagination yet, so bound the worst case instead of
    // shipping an unbounded transaction history.
    .limit(200);

  if (transactionsError) {
    throw transactionsError;
  }

  const enriched = await enrichTransactions(supabase, transactions);

  return { status: 200, data: enriched };
}
