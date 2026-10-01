import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import type { OrganizerUpcomingEventRow } from "@abonten/types/eventAnalytics";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import AnalyticsRowsSkeleton from "./AnalyticsRowsSkeleton";
import InlineErrorRetry from "./InlineErrorRetry";

type Row = OrganizerUpcomingEventRow;

export default function OrganizerUpcomingEvents({
  events,
  isLoading,
  isError,
  onRetry,
}: {
  events: Row[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const locale = useLocale();

  const t = useTranslations("common");
  const format = useFormatter();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">{t("upcomingEvents")}</h2>

      {isLoading ? (
        <AnalyticsRowsSkeleton count={3} />
      ) : isError ? (
        <InlineErrorRetry
          message={t("weCouldnTLoadUpcomingEvents")}
          onRetry={() => onRetry?.()}
        />
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("noUpcomingEventsInTheNext")}
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
                  {event.next_occurrence_starts_at
                    ? formatDateWithSuffix(
                        event.next_occurrence_starts_at,
                        undefined,
                        locale,
                      )
                    : t("dateNotSet")}{" "}
                  &middot;{" "}
                  {event.status === "ongoing" ? t("ongoing") : t("upcoming")}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-medium">
                  {event.capacity != null
                    ? t("soldOfCapacity", {
                        sold: format.number(Number(event.tickets_sold)),
                        capacity: format.number(Number(event.capacity)),
                      })
                    : format.number(Number(event.tickets_sold))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {event.capacity != null ? t("sold2") : t("soldNoCapacitySet")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
