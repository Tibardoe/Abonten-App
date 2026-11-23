"use client";

import getEventTicketTypeAnalytics from "@/actions/getEventTicketTypeAnalytics";
import AnalyticsRowsSkeleton from "@/components/molecules/AnalyticsRowsSkeleton";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { formatMoney } from "@abonten/core/formatMoney";
import {
  type OpenAmountRange,
  openAmountRangeLabel,
} from "@abonten/core/openAmountTickets";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

export default function EventTicketTypeBreakdown({
  eventId,
  ticketNotes,
  openAmountRanges,
  period,
  startDate,
  endDate,
}: {
  eventId: string;
  /** What each ticket type includes, by ticket type id. */
  ticketNotes?: Record<string, string | null>;
  /**
   * The range of each type whose amount the buyer chooses, by ticket type
   * id: its price shows as "GH₵20 to GH₵1,000", not the lowest amount.
   */
  openAmountRanges?: Record<string, OpenAmountRange>;
  period: DashboardPeriod;
  startDate: string | null;
  endDate: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations("common");
  const tc = useTranslations("core");

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

  const rows = response?.status === 200 ? response.data : [];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">{t("ticketTypes")}</h2>

      {isLoading ? (
        <AnalyticsRowsSkeleton count={3} />
      ) : isError ? (
        <InlineErrorRetry
          message={t("weCouldnTLoadTicketType")}
          onRetry={() => refetch()}
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("noTicketTypesSetUpYet")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div
              key={row.ticket_type_id}
              className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4 space-y-2"
            >
              <div className="flex justify-between items-center gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold">
                    {ticketTypeLabel(tc, row.type)}
                  </h3>
                  {ticketNotes?.[row.ticket_type_id] ? (
                    <p className="text-xs text-muted-foreground">
                      {ticketNotes[row.ticket_type_id]}
                    </p>
                  ) : null}
                </div>
                <span className="text-sm text-muted-foreground shrink-0">
                  {t("sold", { sold: row.sold })}
                  {row.quantity_capacity != null
                    ? ` / ${row.quantity_capacity}`
                    : ` / ${t("unlimited")}`}
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
                  {openAmountRanges?.[row.ticket_type_id]
                    ? openAmountRangeLabel(
                        tc,
                        openAmountRanges[row.ticket_type_id],
                        row.currency,
                        locale,
                      )
                    : row.price > 0
                      ? formatMoney(row.currency, Number(row.price), {
                          locale,
                        })
                      : t("free")}
                </span>
                {row.revenue > 0 && (
                  <span>
                    {t("revenue", {
                      amount: formatMoney(row.currency, Number(row.revenue), {
                        locale,
                      }),
                    })}
                  </span>
                )}
                {row.cancelled > 0 && (
                  <span>{t("cancelled3", { cancelled: row.cancelled })}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
