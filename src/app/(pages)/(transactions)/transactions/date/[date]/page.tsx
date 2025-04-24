import { getUserTransactions } from "@/actions/getUserTransactions";
import { transactionsDummyData } from "@/data/transactionsDummyData";
import Link from "next/link";
import { IoMdCheckmarkCircle } from "react-icons/io";

export default async function page({
  params,
}: {
  params: Promise<{ date: Date }>;
}) {
  const { date } = await params;

  const transactions = await getUserTransactions();

  const filteredEvents = transactions.data?.filter(
    (transactionSlips) => transactionSlips.date === date.toString(),
  );

  return filteredEvents?.length ? (
    <ul>
      {filteredEvents.map((transactionSlip) => (
        <Link
          href={`/transactions/${transactionSlip.transactionId}`}
          key={transactionSlip.transactionId}
          className="flex justify-between border-b border-b-black py-5"
        >
          <div className="space-y-1">
            <h2 className="font-bold">{transactionSlip.name}</h2>
            <p className="text-sm font-bold text-gray-500">
              {transactionSlip.reason}
            </p>

            <p className="text-sm text-gray-500">{transactionSlip.date}</p>
          </div>

          <div className="flex items-center gap-2 md:gap-3 font-bold">
            <p>
              {transactionSlip.currency} {transactionSlip.amount}
            </p>

            <IoMdCheckmarkCircle className="text-2xl md:text-3xl" />
          </div>
        </Link>
      ))}
    </ul>
  ) : (
    <div className="m-auto">
      <p>Your account has no transactions for this period.</p>
    </div>
  );
}
