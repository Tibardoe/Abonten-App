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

/**
 * Batch version of enrichTransaction: two bulk .in() queries instead of one
 * query per transaction, so a user with many transactions doesn't issue
 * dozens/hundreds of concurrent queries from a single page load.
 */
export async function enrichTransactions(
  supabase: SupabaseClient,
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  transactions: any[],
) {
  const ticketTransactionIds = transactions
    .filter((transaction) => transaction.reason === "Ticket_Purchase")
    .map((transaction) => transaction.id);

  const subscriptionTransactionIds = transactions
    .filter((transaction) => transaction.reason === "Plan_Purchase")
    .map((transaction) => transaction.id);

  const [{ data: tickets }, { data: subscriptions }] = await Promise.all([
    ticketTransactionIds.length
      ? supabase
          .from("ticket")
          .select("*, event(*)")
          .in("transaction_id", ticketTransactionIds)
      : Promise.resolve({ data: [] }),
    subscriptionTransactionIds.length
      ? supabase
          .from("subscription")
          .select("*, subscription_plan(*)")
          .in("transaction_id", subscriptionTransactionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const ticketByTransactionId = new Map(
    (tickets ?? []).map((ticket) => [ticket.transaction_id, ticket]),
  );
  const subscriptionByTransactionId = new Map(
    (subscriptions ?? []).map((subscription) => [
      subscription.transaction_id,
      subscription,
    ]),
  );

  return transactions.map((transaction) => {
    if (transaction.reason === "Ticket_Purchase") {
      return {
        ...transaction,
        ticket: ticketByTransactionId.get(transaction.id) ?? null,
      };
    }

    if (transaction.reason === "Plan_Purchase") {
      return {
        ...transaction,
        subscription: subscriptionByTransactionId.get(transaction.id) ?? null,
      };
    }

    return transaction;
  });
}
