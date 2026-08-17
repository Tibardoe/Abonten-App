import { getUserTransactionHistory } from "@/actions/getUserTransactionHistory";
import { getUserTransactionSummary } from "@/actions/getUserTransactionSummary";
import type { TransactionPeriod } from "@/utils/transactionsDateRange";
import TransactionsPageClient from "./TransactionsPageClient";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function Page() {
  const initialPeriod: TransactionPeriod = "thisMonth";

  const [allTimeSummary, summary, firstPage] = await Promise.all([
    getUserTransactionSummary("all"),
    getUserTransactionSummary(initialPeriod),
    getUserTransactionHistory(initialPeriod),
  ]);

  async function fetchSummary(period: TransactionPeriod) {
    "use server";
    return getUserTransactionSummary(period);
  }

  async function fetchPage(period: TransactionPeriod, cursor: string | null) {
    "use server";
    return getUserTransactionHistory(period, { cursor });
  }

  const hasAnyHistoryEver =
    allTimeSummary.status === 200 &&
    (allTimeSummary.data[0]?.total_transactions ?? 0) > 0;

  return (
    <TransactionsPageClient
      initialPeriod={initialPeriod}
      initialSummary={summary}
      initialPage={firstPage}
      hasAnyHistoryEver={hasAnyHistoryEver}
      fetchSummary={fetchSummary}
      fetchPage={fetchPage}
    />
  );
}
