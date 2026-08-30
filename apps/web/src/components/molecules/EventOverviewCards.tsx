import StatTile from "@/components/atoms/StatTile";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import StatTilesSkeleton from "@/components/molecules/StatTilesSkeleton";

export default function EventOverviewCards({
  overview,
  isLoading,
  isError,
  onRetry,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  overview: any | null;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  if (isLoading) {
    return <StatTilesSkeleton count={6} />;
  }

  if (isError) {
    return (
      <InlineErrorRetry
        message="We couldn't load this event's overview stats."
        onRetry={() => onRetry?.()}
      />
    );
  }

  if (!overview) {
    return (
      <p className="text-sm text-muted-foreground">
        No sales or registration data yet.
      </p>
    );
  }

  const currency = overview.currency ?? "";
  const money = (amount: number) =>
    `${currency ? `${currency} ` : ""}${Number(amount).toLocaleString()}`;

  // Free/RSVP events lead with registrations, not a sales figure that would
  // otherwise misleadingly read as "GHS 0" — Gross Sales is only shown if
  // the event actually generated some (e.g. a paid add-on ticket type).
  if (overview.require_registration) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile label="Registrations" value={String(overview.tickets_sold)} />
        <StatTile
          label="Attendees"
          value={String(overview.distinct_attendees)}
        />
        <StatTile
          label="Cancelled"
          value={String(overview.tickets_cancelled)}
        />
        {overview.capacity != null && (
          <StatTile
            label="Remaining"
            value={String(overview.capacity_remaining)}
            sublabel={`of ${overview.capacity} capacity`}
          />
        )}
        {overview.gross_sales > 0 && (
          <StatTile label="Gross Sales" value={money(overview.gross_sales)} />
        )}
        {overview.promo_purchase_count > 0 && (
          <StatTile
            label="Promo Purchases"
            value={String(overview.promo_purchase_count)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <StatTile label="Gross Sales" value={money(overview.gross_sales)} />
      <StatTile label="Tickets Sold" value={String(overview.tickets_sold)} />
      <StatTile label="Attendees" value={String(overview.distinct_attendees)} />
      <StatTile label="Cancelled" value={String(overview.tickets_cancelled)} />
      <StatTile
        label="Promo Purchases"
        value={String(overview.promo_purchase_count)}
      />
      {overview.capacity != null && (
        <StatTile
          label="Remaining"
          value={String(overview.capacity_remaining)}
          sublabel={`of ${overview.capacity} capacity`}
        />
      )}
    </div>
  );
}
