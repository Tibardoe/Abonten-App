import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import Link from "next/link";
import AnalyticsRowsSkeleton from "./AnalyticsRowsSkeleton";
import InlineErrorRetry from "./InlineErrorRetry";

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type Row = any;

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
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">Upcoming Events</h2>

      {isLoading ? (
        <AnalyticsRowsSkeleton count={3} />
      ) : isError ? (
        <InlineErrorRetry
          message="We couldn't load upcoming events."
          onRetry={() => onRetry?.()}
        />
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No upcoming events in the next while.
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
                    ? formatDateWithSuffix(event.next_occurrence_starts_at)
                    : "Date not set"}{" "}
                  &middot; {event.status === "ongoing" ? "Ongoing" : "Upcoming"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-medium">
                  {Number(event.tickets_sold).toLocaleString()}
                  {event.capacity != null
                    ? ` / ${Number(event.capacity).toLocaleString()}`
                    : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {event.capacity != null ? "sold" : "sold (no capacity set)"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
