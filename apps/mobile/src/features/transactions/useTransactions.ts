import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import {
  type TransactionPeriod,
  getTransactionPeriodRange,
} from "@abonten/core/transactionsDateRange";
import type { Database } from "@abonten/types/database.types";
import type {
  UserTransactionRow,
  UserTransactionSummaryRow,
} from "@abonten/types/transactions";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

// Native echo of the web getUserTransactionSummary / getUserTransactionHistory
// actions. `get_user_transaction_summary` / `get_user_transaction_history`
// are auth.uid()-internal RPCs (they scope to the caller themselves), so the
// mobile client calls them directly.

// Both RPCs' SQL signatures have no DEFAULT at all on any param, so the
// generator marks every one required + non-null -- but Postgres still
// accepts an explicit null for a required param (a default only governs
// what happens when an arg is OMITTED), and this app has always called
// them with null for "no bound"/"first page". Generated-type gap, not a
// real constraint -- see the identical note in useFilteredEvents.ts.
type SummaryArgs =
  Database["public"]["Functions"]["get_user_transaction_summary"]["Args"];
type HistoryArgs =
  Database["public"]["Functions"]["get_user_transaction_history"]["Args"];

const PAGE = 20;

export function useTransactionSummary(period: TransactionPeriod) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["transactions", "summary", period],
    enabled: !!session,
    queryFn: async (): Promise<UserTransactionSummaryRow[]> => {
      const { start, end } = getTransactionPeriodRange(period);
      const { data, error } = await supabase.rpc(
        "get_user_transaction_summary",
        {
          p_start: start ? start.toISOString() : null,
          p_end: end ? end.toISOString() : null,
        } as unknown as SummaryArgs,
      );
      if (error) throw error;
      return (data ?? []) as UserTransactionSummaryRow[];
    },
  });
}

export function useTransactionHistory(period: TransactionPeriod) {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: ["transactions", "history", period],
    enabled: !!session,
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const { start, end } = getTransactionPeriodRange(period);
      const { data, error } = await supabase.rpc(
        "get_user_transaction_history",
        {
          p_start: start ? start.toISOString() : null,
          p_end: end ? end.toISOString() : null,
          p_cursor_created_at: pageParam?.createdAt ?? null,
          p_cursor_id: pageParam?.id ?? null,
          p_limit: PAGE + 1,
        } as unknown as HistoryArgs,
      );
      if (error) throw error;
      const all = (data ?? []) as UserTransactionRow[];
      const hasNext = all.length > PAGE;
      const rows = hasNext ? all.slice(0, PAGE) : all;
      const last = rows[rows.length - 1];
      return {
        rows,
        nextCursor:
          hasNext && last ? { createdAt: last.created_at, id: last.id } : null,
      };
    },
    getNextPageParam: (p) => p.nextCursor,
  });
}
