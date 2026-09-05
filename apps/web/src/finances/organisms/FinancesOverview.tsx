"use client";

import getOrganizerFinanceOverview from "@/actions/getOrganizerFinanceOverview";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { invalidateOrganizerFinanceQueries } from "@/utils/mutationQueryInvalidation";
import type { OrganizerFinanceOverviewRow } from "@abonten/types/organizerFinance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import PendingEarningsList from "../molecules/PendingEarningsList";
import RefundSummary from "../molecules/RefundSummary";
import WithdrawModal from "../molecules/WithdrawModal";

export const ORGANIZER_FINANCE_OVERVIEW_QUERY_KEY = [
  "organizer-finance-overview",
];

type FinancesOverviewProps = {
  initialOverview: OrganizerFinanceOverviewRow[];
};

/**
 * "How much money can I withdraw right now?" — the main question this page
 * answers immediately. Reads the same getOrganizerFinanceOverview action the
 * Dashboard summary and Event Insights use, so these figures can never
 * disagree. Cross-currency organizers are rare (this schema has no
 * cross-currency aggregation anywhere else either — see
 * add_currency_to_event_overview_analytics_v2's comment) so the first
 * currency row drives the primary tiles/Withdraw button, matching the
 * Dashboard's existing "primaryCurrency" convention; any additional
 * currencies still get their own summary line underneath.
 */
export default function FinancesOverview({
  initialOverview,
}: FinancesOverviewProps) {
  const queryClient = useQueryClient();
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ORGANIZER_FINANCE_OVERVIEW_QUERY_KEY,
    queryFn: async () => {
      const response = await getOrganizerFinanceOverview();
      return response.status === 200 ? response.data : [];
    },
    initialData: initialOverview,
    staleTime: 20_000,
  });

  const rows = data ?? [];
  const primary = rows[0] ?? {
    currency: "GHS",
    pending_balance: 0,
    available_balance: 0,
    total_earnings: 0,
  };
  const otherCurrencies = rows.slice(1);

  const invalidateAll = () => invalidateOrganizerFinanceQueries(queryClient);

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-border bg-card text-card-foreground p-5 md:p-6 space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Available to withdraw</p>
          <p className="font-bold text-2xl md:text-3xl">
            {primary.currency} {primary.available_balance.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Money available after eligible event proceeds, refunds, and previous
            withdrawals are accounted for.
          </p>
        </div>

        {primary.available_balance > 0 && (
          <Button
            type="button"
            onClick={() => setIsWithdrawOpen(true)}
            className="font-semibold rounded-md px-6 py-5"
          >
            Withdraw
          </Button>
        )}

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
          <div>
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="font-semibold text-lg">
              {primary.currency} {primary.pending_balance.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total earnings</p>
            <p className="font-semibold text-lg">
              {primary.currency} {primary.total_earnings.toLocaleString()}
            </p>
          </div>
        </div>

        {otherCurrencies.length > 0 && (
          <div className="pt-2 border-t border-border space-y-1">
            {otherCurrencies.map((row) => (
              <p key={row.currency} className="text-xs text-muted-foreground">
                {row.currency}: {row.available_balance.toLocaleString()}{" "}
                available · {row.pending_balance.toLocaleString()} pending
              </p>
            ))}
          </div>
        )}
      </section>

      <PendingEarningsList />
      <RefundSummary />

      {isWithdrawOpen && (
        <WithdrawModal
          availableBalance={primary.available_balance}
          currency={primary.currency}
          onClose={() => setIsWithdrawOpen(false)}
          onSuccess={invalidateAll}
          onBalanceStale={invalidateAll}
        />
      )}
    </div>
  );
}
