"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { requestTimeZone } from "@/utils/requestTimeZone";
import { logger } from "@abonten/core/logger";
import {
  type TransactionPeriod,
  getTransactionPeriodRange,
} from "@abonten/core/transactionsDateRange";
import { tr } from "@abonten/services/i18n/requestLocale";
import type { Database } from "@abonten/types/database.types";
import type { UserTransactionSummaryRow } from "@abonten/types/transactions";

export const getUserTransactionSummary = withActionLocale(
  async function getUserTransactionSummary(period: TransactionPeriod) {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      return { status: 401 as const, message: tr("userNotLoggedIn") };
    }

    const { start, end } = getTransactionPeriodRange(
      period,
      new Date(),
      await requestTimeZone(),
    );

    const { data, error } = await supabase.rpc("get_user_transaction_summary", {
      p_start: start ? start.toISOString() : null,
      p_end: end ? end.toISOString() : null,
    } as unknown as Database["public"]["Functions"]["get_user_transaction_summary"]["Args"]);

    if (error) {
      logger.error("Supabase error:", error.message);
      return {
        status: 500 as const,
        message: tr("somethingWentWrong"),
      };
    }

    return {
      status: 200 as const,
      data: (data ?? []) as UserTransactionSummaryRow[],
    };
  },
);
