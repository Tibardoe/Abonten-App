"use server";

import { createClient } from "@/config/supabase/server";
import type { PaginatedResult, SimpleCursor } from "@/types/pagination";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@/utils/pagination";
import { enrichTransactions } from "./transactionEnrichment";

// Filters by date directly in the query instead of loading the user's
// entire transaction history and filtering it in memory. `date` is a
// "YYYY-MM-DD" string (see TransactionsFilterLinks.tsx), matched in UTC to
// mirror the existing `toISOString().split("T")[0]` comparison it replaces.
export async function getTransactionsByDate(
  date: string,
  options?: { cursor?: string | null; pageSize?: number },
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
): Promise<PaginatedResult<any>> {
  const supabase = await createClient();
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return {
      status: 401,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not authenticated",
    };
  }

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  let query = supabase
    .from("transaction")
    .select("*")
    .eq("user_id", user.user.id)
    .gte("transaction_date", dayStart)
    .lte("transaction_date", dayEnd)
    .order("transaction_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("transaction_date", "id", cursor));
  }

  const { data: transactions, error: transactionsError } = await query;

  if (transactionsError) {
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: `Error fetching transactions: ${transactionsError.message}`,
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  const { page, hasNextPage } = splitPage<any>(transactions ?? [], pageSize);
  const enriched = await enrichTransactions(supabase, page);

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.transaction_date),
          id: last.id,
        })
      : null;

  return { status: 200, data: enriched, nextCursor, hasNextPage };
}
