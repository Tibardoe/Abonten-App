import { getOrganizerLedgerTransactions } from "@/actions/getOrganizerLedgerTransactions";
import FinancesTransactionsList from "@/finances/organisms/FinancesTransactionsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function FinancesTransactionsPage() {
  const firstPage = await getOrganizerLedgerTransactions();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-bold md:text-lg">Transactions</h2>
        <p className="text-sm text-muted-foreground">
          Every ticket sale, fee, refund, and payout that moved your balance.
        </p>
      </div>

      <FinancesTransactionsList initialPage={firstPage} />
    </div>
  );
}
