"use client";

import { useMarketContext } from "@/hooks/useMarketContext";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import type { OrganizerEventPerformanceRow } from "@abonten/types/eventAnalytics";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import AnalyticsRowsSkeleton from "./AnalyticsRowsSkeleton";
import InlineErrorRetry from "./InlineErrorRetry";

type Row = OrganizerEventPerformanceRow;

const STATUS_LABEL: Record<string, string> = {
  upcoming: "upcoming",
  ongoing: "ongoing",
  ended: "ended",
};

export default function OrganizerEventPerformanceList({
  events,
  sort,
  onSortChange,
  isLoading,
  isError,
  onRetry,
}: {
  events: Row[];
  sort: "revenue" | "tickets";
  onSortChange: (sort: "revenue" | "tickets") => void;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const locale = useLocale();

  const t = useTranslations("common");

  // An event with no sales yet has no currency in its revenue row; show its
  // zero in the market's currency rather than as a bare "0.00".
  const { market } = useMarketContext();
  const fallbackCurrency = market?.defaultCurrency ?? null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold md:text-lg">{t("eventPerformance")}</h2>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => onSortChange("revenue")}
            className={
              sort === "revenue"
                ? "font-bold text-primary"
                : "text-muted-foreground"
            }
          >
            {t("revenue2")}
          </button>
          <span className="text-muted-foreground">&middot;</span>
          <button
            type="button"
            onClick={() => onSortChange("tickets")}
            className={
              sort === "tickets"
                ? "font-bold text-primary"
                : "text-muted-foreground"
            }
          >
            {t("ticketsSold")}
          </button>
        </div>
      </div>

      {isLoading ? (
        <AnalyticsRowsSkeleton count={5} />
      ) : isError ? (
        <InlineErrorRetry
          message={t("weCouldnTLoadEventPerformance")}
          onRetry={() => onRetry?.()}
        />
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("noEventSalesInThisPeriod")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((event) => (
            <Link
              key={event.event_id}
              href={`/manage/events/${event.event_id}?tab=insights`}
              className="border border-border bg-card rounded-md shadow-md p-4 flex items-center justify-between gap-3 hover:border-primary transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {event.starts_at
                    ? formatDateWithSuffix(event.starts_at, undefined, locale)
                    : t("dateNotSet")}{" "}
                  &middot;{" "}
                  {STATUS_LABEL[event.status]
                    ? t(STATUS_LABEL[event.status])
                    : event.status}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold">
                  {formatMoney(
                    event.currency ?? fallbackCurrency,
                    Number(event.revenue),
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("tickets2", {
                    toLocaleString: Number(event.tickets_sold).toLocaleString(),
                  })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Link href="/manage/events" className="text-sm text-primary self-start">
        {t("viewAllEvents")}
      </Link>
    </section>
  );
}
