"use server";

import { createClient } from "@/config/supabase/server";
import { enrichTransactions } from "./transactionEnrichment";

// Filters by date directly in the query instead of loading the user's
// entire transaction history and filtering it in memory. `date` is a
// "YYYY-MM-DD" string (see TransactionsFilterLinks.tsx), matched in UTC to
// mirror the existing `toISOString().split("T")[0]` comparison it replaces.
export async function getTransactionsByDate(date: string) {
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

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const { data: transactions, error: transactionsError } = await supabase
    .from("transaction")
    .select("*")
    .eq("user_id", user.user.id)
    .gte("transaction_date", dayStart)
    .lte("transaction_date", dayEnd)
    .order("transaction_date", { ascending: false });

  if (transactionsError) {
    return {
      status: 500,
      message: `Error fetching transactions: ${transactionsError.message}`,
    };
  }

  const enriched = await enrichTransactions(supabase, transactions ?? []);

  return { status: 200, data: enriched };
}
