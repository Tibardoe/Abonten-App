"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import {
  type TransactionPeriod,
  getTransactionPeriodRange,
} from "@abonten/core/transactionsDateRange";
import type { UserTransactionSummaryRow } from "@abonten/types/transactions";

export async function getUserTransactionSummary(period: TransactionPeriod) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: "User not logged in" };
  }

  const { start, end } = getTransactionPeriodRange(period);

  const { data, error } = await supabase.rpc("get_user_transaction_summary", {
    p_start: start ? start.toISOString() : null,
    p_end: end ? end.toISOString() : null,
  });

  if (error) {
    logger.error("Supabase error:", error.message);
    return { status: 500 as const, message: "Something went wrong!" };
  }

  return {
    status: 200 as const,
    data: (data ?? []) as UserTransactionSummaryRow[],
  };
}
