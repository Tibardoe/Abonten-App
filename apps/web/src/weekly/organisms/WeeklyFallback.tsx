import EventCard from "@/components/molecules/EventCard";
import { WEEKLY_PRODUCT_NAME, WEEKLY_TAGLINE } from "@abonten/core/weekly/copy";
import type { UserPostType } from "@abonten/types/postsType";
import Link from "next/link";

// Shown when there is no edition to show. Never a dead end: when there are
// upcoming events this week they are listed (they are simply this week's
// events, not labelled as picks), and there is always a way on to Explore.
export default function WeeklyFallback({
  events,
  unavailable = false,
}: {
  events: UserPostType[];
  /** The programme is not open to this visitor, or the edition is gone. */
  unavailable?: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <header className="rounded-2xl border border-border bg-muted/40 p-5 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {WEEKLY_PRODUCT_NAME}
        </p>
        <h1 className="mt-2 text-2xl font-bold md:text-3xl">
          {unavailable
            ? "This edition isn't available"
            : "This week's edition is on its way"}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {unavailable
            ? "It may have been taken down, or it isn't out yet."
            : WEEKLY_TAGLINE}
        </p>
        <Link
          href="/explore"
          className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Explore events and places
        </Link>
      </header>

      {events.length > 0 ? (
        <section aria-labelledby="weekly-fallback-events">
          <h2
            id="weekly-fallback-events"
            className="mb-3 text-lg font-semibold md:text-xl"
          >
            Happening this week
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {events.map((event, i) => (
              <EventCard key={event.id} {...event} priority={i < 4} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
