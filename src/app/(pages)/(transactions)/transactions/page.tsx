import { getUserTransactions } from "@/actions/getUserTransactions";
import TransactionsList from "./TransactionsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const emptyState = (
  <div className="m-auto">
    <p>Your account has no transactions yet.</p>
  </div>
);

export default async function page() {
  const firstPage = await getUserTransactions();

  async function fetchPage(cursor: string | null) {
    "use server";
    return getUserTransactions({ cursor });
  }

  return (
    <TransactionsList
      queryKey={["transactions"]}
      initialPage={firstPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      showAllStatusIcons
    />
  );
}
