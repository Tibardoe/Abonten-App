"use client";

import getOrganizerPayouts from "@/actions/getOrganizerPayouts";
import { Button } from "@/components/ui/button";
import { formatSingleDateTime } from "@/utils/dateFormatter";
import type { OrganizerPayoutRow } from "@abonten/types/organizerFinance";
import Link from "next/link";
import { useState } from "react";
import FinanceLineIcon, {
  getFinanceStatusMeta,
} from "../atoms/FinanceLineIcon";

const PAGE_SIZE = 20;

type FinancesPayoutsListProps = {
  initialPayouts: OrganizerPayoutRow[];
};

/**
 * Payout volume per organizer is far smaller than the ticket-sale ledger
 * (one row per withdrawal, not per order) — a simple "Load more" button on
 * offset pagination is enough here, unlike the cursor-based infinite scroll
 * used for Finances > Transactions.
 */
export default function FinancesPayoutsList({
  initialPayouts,
}: FinancesPayoutsListProps) {
  const [payouts, setPayouts] = useState(initialPayouts);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialPayouts.length === PAGE_SIZE);

  const loadMore = async () => {
    setIsLoadingMore(true);
    const response = await getOrganizerPayouts(payouts.length, PAGE_SIZE);
    setIsLoadingMore(false);

    if (response.status !== 200) return;

    setPayouts((prev) => [...prev, ...response.data]);
    setHasMore(response.data.length === PAGE_SIZE);
  };

  if (payouts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No payouts yet
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <ul>
        {payouts.map((payout) => {
          const { date } = formatSingleDateTime(payout.requested_at);
          const { label } = getFinanceStatusMeta(payout.status);

          return (
            <li key={payout.id}>
              <Link
                href={`/finances/payouts/${payout.id}`}
                className="flex justify-between border-b border-border py-5"
              >
                <div className="space-y-1">
                  <h2 className="font-bold">
                    {payout.currency} {payout.amount.toLocaleString()}
                  </h2>
                  <p className="text-sm text-muted-foreground">{date}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {payout.reference}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{label}</span>
                  <FinanceLineIcon status={payout.status} className="text-xl" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <Button
          type="button"
          variant="outline"
          disabled={isLoadingMore}
          onClick={loadMore}
          className="self-center mt-4"
        >
          {isLoadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
