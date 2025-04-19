import { transactionsDummyData } from "@/data/transactionsDummyData";
import { IoMdCheckmarkCircle } from "react-icons/io";

import Link from "next/link";
import { BsFillDashCircleFill } from "react-icons/bs";
import { MdCancel } from "react-icons/md";

export default function page() {
  return transactionsDummyData.length ? (
    <ul>
      {transactionsDummyData.map((transactionSlip) => (
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

            {transactionSlip?.status === "Successful" && (
              <IoMdCheckmarkCircle className="text-2xl md:text-3xl" />
            )}

            {transactionSlip?.status === "Pending" && (
              <BsFillDashCircleFill className="text-xl md:text-2xl" />
            )}

            {transactionSlip?.status === "Failed" && (
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
