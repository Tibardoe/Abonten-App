"use client";

import getEventTicketTypeAnalytics from "@/actions/getEventTicketTypeAnalytics";
import AnalyticsRowsSkeleton from "@/components/molecules/AnalyticsRowsSkeleton";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { useQuery } from "@tanstack/react-query";

export default function EventTicketTypeBreakdown({
  eventId,
  period,
  startDate,
  endDate,
}: {
  eventId: string;
  period: DashboardPeriod;
  startDate: string | null;
  endDate: string | null;
}) {
  const {
    data: response,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["event-analytics-ticket-types", eventId, period],
    queryFn: () => getEventTicketTypeAnalytics(eventId, startDate, endDate),
    staleTime: 20_000,
  });

  const rows = response?.data ?? [];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">Ticket Types</h2>

      {isLoading ? (
        <AnalyticsRowsSkeleton count={3} />
      ) : isError ? (
        <InlineErrorRetry
          message="We couldn't load ticket type sales."
          onRetry={() => refetch()}
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ticket types set up yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md) */}
          {rows.map((row: any) => (
            <div
              key={row.ticket_type_id}
              className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4 space-y-2"
            >
              <div className="flex justify-between items-center gap-2">
                <h3 className="font-semibold">{row.type}</h3>
                <span className="text-sm text-muted-foreground shrink-0">
                  {row.sold} sold
                  {row.quantity_capacity != null
                    ? ` / ${row.quantity_capacity}`
                    : " / Unlimited"}
                </span>
              </div>

              {row.quantity_capacity != null && (
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${Math.min(100, row.percent_sold ?? 0)}%`,
                    }}
                  />
                </div>
              )}

              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {row.price > 0
                    ? `${row.currency ?? ""} ${Number(row.price).toLocaleString()}`.trim()
                    : "Free"}
                </span>
                {row.revenue > 0 && (
                  <span>
                    {row.currency ?? ""} {Number(row.revenue).toLocaleString()}{" "}
                    revenue
                  </span>
                )}
                {row.cancelled > 0 && <span>{row.cancelled} cancelled</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
