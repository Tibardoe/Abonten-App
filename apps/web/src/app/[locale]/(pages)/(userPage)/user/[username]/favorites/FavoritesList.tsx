"use client";

import EventCard from "@/components/molecules/EventCard";
import InfiniteList from "@/components/organisms/InfiniteList";
import type { FavoriteEvents } from "@abonten/types/favoriteEventTypes";
import type { PaginatedResult } from "@abonten/types/pagination";

export default function FavoritesList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<FavoriteEvents>;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<FavoriteEvents>>;
  emptyState: React.ReactNode;
}) {
  return (
    <InfiniteList<FavoriteEvents>
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listClassName="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5 mb-5 md:mb-0"
      renderItem={(favorite, index) => {
        const event = favorite.event;
        return (
          <EventCard
            key={event.id}
            priority={index < 4}
            title={event.title}
            id={event.id}
            event_code={event.event_code}
            flyer_public_id={event.flyer_public_id}
            flyer_version={event.flyer_version}
            address={event.address}
            starts_at={event.starts_at}
            occurrences={event.event_occurrence}
            ends_at={event.ends_at}
            organizer_id={event.organizer_id}
            min_price={event.price}
            currency={event.currency ?? ""}
            created_at={event.created_at}
            attendanceCount={event.attendanceCount ?? 0}
          />
        );
      }}
    />
  );
}
