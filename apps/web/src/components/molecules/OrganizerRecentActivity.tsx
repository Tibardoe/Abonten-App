import { getRelativeTime } from "@abonten/core/dateFormatter";
import { TbCalendarPlus, TbTicket, TbTicketOff } from "react-icons/tb";
import { Skeleton } from "../ui/skeleton";
import InlineErrorRetry from "./InlineErrorRetry";

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type Row = any;

const ACTIVITY_ICON: Record<string, typeof TbTicket> = {
  ticket_sold: TbTicket,
  ticket_cancelled: TbTicketOff,
  registration: TbCalendarPlus,
};

export default function OrganizerRecentActivity({
  items,
  isLoading,
  isError,
  onRetry,
}: {
  items: Row[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <InlineErrorRetry
        message="We couldn't load recent activity."
        onRetry={() => onRetry?.()}
      />
    );
  }

  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-bold md:text-lg">Recent Activity</h2>
        <p className="text-sm text-muted-foreground">No recent activity yet.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">Recent Activity</h2>
      <div className="flex flex-col divide-y divide-border border border-border bg-card rounded-md shadow-md">
        {items.map((item, i) => {
          const Icon = ACTIVITY_ICON[item.activity_type] ?? TbTicket;
          const verb =
            item.activity_type === "ticket_sold"
              ? "Ticket sold for"
              : item.activity_type === "ticket_cancelled"
                ? "Ticket cancelled for"
                : "New registration for";

          return (
            <div
              key={`${item.event_id}-${item.occurred_at}-${i.toLocaleString()}`}
              className="flex items-center gap-3 p-3"
            >
              <Icon
                className="text-lg text-muted-foreground shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">
                  {verb} {item.event_title}
                </p>
              </div>
              <p className="text-xs text-muted-foreground shrink-0">
                {getRelativeTime(item.occurred_at)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
