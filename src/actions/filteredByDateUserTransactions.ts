"use server";

import { createClient } from "@/config/supabase/server";

export async function filteredByDateUserTransactions(date: Date) {
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

  const { data: transactions, error: transactionsError } = await supabase
    .from("transaction")
    .select("*")
    .eq("user_id", user.user.id)
    .order("created_at", { ascending: false });

  if (transactionsError) {
    return {
      status: 500,
      message: `Error fetching transactions: ${transactionsError.message}`,
    };
  }

  const filteredByDate = transactions?.filter(
    (transaction) => transaction.date === date,
  );

  const enriched = await Promise.all(
    (filteredByDate || []).map(async (transaction) => {
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
    }),
  );

  return { status: 200, data: enriched };
}
