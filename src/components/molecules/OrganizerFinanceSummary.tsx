"use client";

import getOrganizerFinanceOverview from "@/actions/getOrganizerFinanceOverview";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

/**
 * A lightweight entry point into Finances from the Dashboard — reads the
 * exact same getOrganizerFinanceOverview action the Finances Overview page
 * uses, so these two never disagree. Deliberately small: no Withdraw
 * button, no breakdown — the Dashboard stays analytics-first, Finances
 * stays where money actually moves.
 */
export default function OrganizerFinanceSummary() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["organizer-finance-overview"],
    queryFn: getOrganizerFinanceOverview,
    staleTime: 20_000,
  });

  if (isLoading) {
    return <Skeleton className="h-20 w-full rounded-xl" />;
  }

  if (isError) {
    return (
      <InlineErrorRetry
        message="We couldn't load your finance summary."
        onRetry={() => refetch()}
      />
    );
  }

  const overview = data?.status === 200 ? data.data[0] : null;

  if (!overview) {
    return (
      <p className="text-sm text-muted-foreground">
        No finance data available yet.
      </p>
    );
  }

  return (
    <Link
      href="/finances"
      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card text-card-foreground p-4 hover:border-primary transition-colors"
    >
      <div className="flex gap-6">
        <div>
          <p className="text-xs text-muted-foreground">Available to withdraw</p>
          <p className="font-bold">
            {overview.currency} {overview.available_balance.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="font-bold">
            {overview.currency} {overview.pending_balance.toLocaleString()}
          </p>
        </div>
      </div>

      <span className="text-sm font-medium text-primary shrink-0">
        View Finances
      </span>
    </Link>
  );
}
