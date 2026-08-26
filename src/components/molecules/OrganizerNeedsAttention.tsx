import Link from "next/link";
import { TbAlertTriangle, TbCircleCheck } from "react-icons/tb";
import { Skeleton } from "../ui/skeleton";
import InlineErrorRetry from "./InlineErrorRetry";

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type Row = any;

// Simple, explainable, threshold-based rules only (see
// get_organizer_needs_attention) — no speculative/AI-generated warnings.
export default function OrganizerNeedsAttention({
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
        <Skeleton className="h-14 w-full rounded-md" />
      </div>
    );
  }

  if (isError) {
    return (
      <InlineErrorRetry
        message="We couldn't check what needs attention."
        onRetry={() => onRetry?.()}
      />
    );
  }

  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-bold md:text-lg">Needs Attention</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TbCircleCheck
            className="text-lg text-primary shrink-0"
            aria-hidden="true"
          />
          You're all caught up — nothing needs attention right now.
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">Needs Attention</h2>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <Link
            key={`${item.event_id}-${item.rule_type}-${i.toLocaleString()}`}
            href={`/manage/events/${item.event_id}?tab=insights`}
            className="border border-border bg-card rounded-md shadow-md p-4 flex items-start gap-3 hover:border-primary transition-colors"
          >
            <TbAlertTriangle
              className="text-xl text-destructive shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="font-medium truncate">{item.event_title}</p>
              <p className="text-sm text-muted-foreground">{item.message}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
