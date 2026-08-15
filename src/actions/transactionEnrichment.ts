import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared by getUserTransactions / getTransactionById / getTransactionsByDate
 * so the ticket/subscription join logic exists in one place instead of
 * being copy-pasted per action.
 */
export async function enrichTransaction(
  supabase: SupabaseClient,
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  transaction: any,
) {
  if (transaction.reason === "Ticket_Purchase") {
    const { data: ticket } = await supabase
      .from("ticket")
      .select("*, event(*)")
      .eq("transaction_id", transaction.id)
      .single();

    return { ...transaction, ticket };
  }

  if (transaction.reason === "Plan_Purchase") {
    const { data: subscription } = await supabase
      .from("subscription")
      .select("*, subscription_plan(*)")
      .eq("transaction_id", transaction.id)
      .single();

    return { ...transaction, subscription };
  }

  return transaction;
}

export async function enrichTransactions(
  supabase: SupabaseClient,
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  transactions: any[],
) {
  return Promise.all(
    transactions.map((transaction) => enrichTransaction(supabase, transaction)),
  );
}
