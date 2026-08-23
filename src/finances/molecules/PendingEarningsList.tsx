"use client";

import getOrganizerPendingEarnings from "@/actions/getOrganizerPendingEarnings";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

export default function PendingEarningsList() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["organizer-pending-earnings"],
    queryFn: getOrganizerPendingEarnings,
    staleTime: 20_000,
  });

  const rows = data?.status === 200 ? data.data : [];

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-bold md:text-lg">Pending earnings</h2>
        <p className="text-sm text-muted-foreground">
          Funds become available 48 hours after each event ends, once settlement
          conditions are met.
        </p>
      </div>

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn't load pending earnings.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No pending funds</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={`${row.event_id}-${row.currency}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card text-card-foreground p-4"
            >
              <div>
                <p className="font-medium text-sm">{row.event_title}</p>
                <p className="text-xs text-muted-foreground">
                  Pending settlement
                </p>
              </div>

              <div className="flex items-center gap-3">
                <p className="font-semibold text-sm">
                  {row.currency} {row.amount.toLocaleString()}
                </p>
                <Link
                  href={`/manage/events/${row.event_id}?tab=insights`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View event
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
