"use client";

import EventCard from "@/components/molecules/EventCard";
import EventsInfiniteGrid from "@/components/organisms/EventsInfiniteGrid";
import type { PaginatedResult } from "@/types/pagination";
import type { UserPostType } from "@/types/postsType";

export default function ExploreEventsList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<UserPostType>;
  fetchPage: (cursor: string | null) => Promise<PaginatedResult<UserPostType>>;
  emptyState: React.ReactNode;
}) {
  return (
    <EventsInfiniteGrid
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 overflow-x-scroll scrollbar-hide gap-2 pb-5"
      renderItem={(event, index) => (
        <EventCard
          key={event.id}
          priority={index < 4}
          title={event.title}
          id={event.id}
          flyer_public_id={event.flyer_public_id}
          flyer_version={event.flyer_version}
          event_code={event.event_code}
          address={event.address}
          starts_at={event.starts_at}
          occurrences={event.occurrences}
          ends_at={event.ends_at}
          organizer_id={event.organizer_id}
          min_price={event.min_price}
          currency={event.currency ?? ""}
          created_at={event.created_at}
          attendanceCount={event.attendanceCount ?? 0}
        />
      )}
    />
  );
}
