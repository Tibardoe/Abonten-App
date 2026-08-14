import { getUserTransactions } from "@/actions/getUserTransactions";
import { formatSingleDateTime } from "@/utils/dateFormatter";
import { humanizeTransactionReason } from "@/utils/humanizeTransactionReason";
import Link from "next/link";
import { BsFillDashCircleFill } from "react-icons/bs";
import { IoMdCheckmarkCircle } from "react-icons/io";
import { MdCancel } from "react-icons/md";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page() {
  const transactions = await getUserTransactions();

  return transactions.data?.length ? (
    <ul>
      {transactions.data.map((transaction) => (
        <Link
          href={`/transactions/${transaction.id}`}
          key={transaction.id}
          className="flex justify-between border-b border-border py-5"
        >
          <div className="space-y-1">
            <h2 className="font-bold">{transaction.full_name}</h2>
            <p className="text-sm font-bold text-muted-foreground">
              {humanizeTransactionReason(transaction.reason)}
            </p>

            <p className="text-sm text-muted-foreground">
              {formatSingleDateTime(transaction.transaction_date).date}
            </p>
          </div>

          <div className="flex items-center gap-2 md:gap-3 font-bold">
            <p>
              {transaction.currency} {transaction.amount}
            </p>

            {transaction.status?.toLowerCase() === "successful" && (
              <IoMdCheckmarkCircle className="text-2xl md:text-3xl" />
            )}

            {transaction.status?.toLowerCase() === "pending" && (
              <BsFillDashCircleFill className="text-xl md:text-2xl" />
            )}

            {transaction.status?.toLowerCase() === "failed" && (
              <MdCancel className="text-2xl md:text-3xl" />
            )}
          </div>
        </Link>
      ))}
    </ul>
  ) : (
    <div className="m-auto">
      <p>Your account has no transactions yet.</p>
    </div>
  );
}
