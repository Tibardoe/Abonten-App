"use client";

import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@/types/pagination";
import { formatSingleDateTime } from "@/utils/dateFormatter";
import { humanizeTransactionReason } from "@/utils/humanizeTransactionReason";
import Link from "next/link";
import { BsFillDashCircleFill } from "react-icons/bs";
import { IoMdCheckmarkCircle } from "react-icons/io";
import { MdCancel } from "react-icons/md";

export default function TransactionsList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
  showAllStatusIcons = false,
}: {
  queryKey: unknown[];
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  initialPage: PaginatedResult<any>;
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  fetchPage: (cursor: string | null) => Promise<PaginatedResult<any>>;
  emptyState: React.ReactNode;
  showAllStatusIcons?: boolean;
}) {
  return (
    <InfiniteList
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
      renderItem={(transaction: any) => (
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

            {showAllStatusIcons ? (
              <>
                {transaction.status?.toLowerCase() === "successful" && (
                  <IoMdCheckmarkCircle className="text-2xl md:text-3xl" />
                )}

                {transaction.status?.toLowerCase() === "pending" && (
                  <BsFillDashCircleFill className="text-xl md:text-2xl" />
                )}

                {transaction.status?.toLowerCase() === "failed" && (
                  <MdCancel className="text-2xl md:text-3xl" />
                )}
              </>
            ) : (
              <IoMdCheckmarkCircle className="text-2xl md:text-3xl" />
            )}
          </div>
        </Link>
      )}
    />
  );
}
