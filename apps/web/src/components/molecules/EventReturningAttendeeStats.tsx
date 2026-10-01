"use client";

import getEventReturningAttendeeStats from "@/actions/getEventReturningAttendeeStats";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import StatTilesSkeleton from "@/components/molecules/StatTilesSkeleton";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

export default function EventReturningAttendeeStats({
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
  const t = useTranslations("common");

  const {
    data: response,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["event-analytics-returning", eventId, period],
    queryFn: () => getEventReturningAttendeeStats(eventId, startDate, endDate),
    staleTime: 20_000,
  });

  const stats = response?.status === 200 ? response.data : null;
  const total = stats
    ? Number(stats.returning_count) + Number(stats.first_time_count)
    : 0;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">{t("attendeeBehavior")}</h2>

      {isLoading ? (
        <StatTilesSkeleton count={2} />
      ) : isError ? (
        <InlineErrorRetry
          message={t("weCouldnTLoadAttendeeBehavior")}
          onRetry={() => refetch()}
        />
      ) : !stats || total === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("notEnoughAttendeesYetToCalculate")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
            <div
              className="h-full bg-primary"
              style={{
                width: `${(Number(stats.returning_count) / total) * 100}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span>
              {t("returning", {
                round: Math.round(
                  (Number(stats.returning_count) / total) * 100,
                ),
              })}
              <span className="text-muted-foreground">
                {" "}
                ({stats.returning_count})
              </span>
            </span>
            <span>
              {t("firstTime", {
                round: Math.round(
                  (Number(stats.first_time_count) / total) * 100,
                ),
              })}
              <span className="text-muted-foreground">
                {" "}
                ({stats.first_time_count})
              </span>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
