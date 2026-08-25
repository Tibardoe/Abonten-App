"use client";

import { formatDateWithSuffix } from "@/utils/dateFormatter";
import Link from "next/link";
import AnalyticsRowsSkeleton from "./AnalyticsRowsSkeleton";

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type Row = any;

const STATUS_LABEL: Record<string, string> = {
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  ended: "Ended",
};

export default function OrganizerEventPerformanceList({
  events,
  sort,
  onSortChange,
  isLoading,
}: {
  events: Row[];
  sort: "revenue" | "tickets";
  onSortChange: (sort: "revenue" | "tickets") => void;
  isLoading: boolean;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold md:text-lg">Event Performance</h2>
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
            Revenue
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
            Tickets Sold
          </button>
        </div>
      </div>

      {isLoading ? (
        <AnalyticsRowsSkeleton count={5} />
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No event sales in this period yet.
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
                    ? formatDateWithSuffix(event.starts_at)
                    : "Date not set"}{" "}
                  &middot; {STATUS_LABEL[event.status] ?? event.status}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold">
                  {event.currency ? `${event.currency} ` : ""}
                  {Number(event.revenue).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {Number(event.tickets_sold).toLocaleString()} tickets
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Link href="/manage/events" className="text-sm text-primary self-start">
        View all events
      </Link>
    </section>
  );
}
