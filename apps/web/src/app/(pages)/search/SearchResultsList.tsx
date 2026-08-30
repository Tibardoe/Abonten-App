"use client";

import EventCard from "@/components/molecules/EventCard";
import EventsInfiniteGrid from "@/components/organisms/EventsInfiniteGrid";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";

// The renderItem closure below must live in a Client Component — Next.js
// cannot pass plain functions (only Server Actions or already-rendered
// JSX) from a Server Component across to a Client Component prop.
export default function SearchResultsList({
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
      listClassName="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5"
      renderItem={(event, index) => (
        <EventCard
          key={event.id}
          priority={index < 4}
          id={event.id}
          title={event.title}
          flyer_public_id={event.flyer_public_id}
          flyer_version={event.flyer_version}
          address={event.address}
          event_code={event.event_code}
          starts_at={event.starts_at}
          ends_at={event.ends_at}
          organizer_id={event.organizer_id}
          occurrences={event.occurrences}
          minTicket={event.minTicket}
          created_at={event.created_at}
          capacity={event.capacity}
          min_price={event.min_price}
          currency={event.currency}
          attendance_count={event.attendance_count}
        />
      )}
    />
  );
}
