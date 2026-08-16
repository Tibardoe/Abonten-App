import { getTransactionsByDate } from "@/actions/getTransactionsByDate";
import TransactionsList from "../../TransactionsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const emptyState = (
  <div className="m-auto">
    <p>Your account has no transactions for this period.</p>
  </div>
);

export default async function page({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;

  const firstPage = await getTransactionsByDate(date);

  async function fetchPage(cursor: string | null) {
    "use server";
    return getTransactionsByDate(date, { cursor });
  }

  return (
    <TransactionsList
      queryKey={["transactions", "date", date]}
      initialPage={firstPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
    />
  );
}
