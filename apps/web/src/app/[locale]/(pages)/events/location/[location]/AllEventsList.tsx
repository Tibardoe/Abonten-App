"use client";

import EventCard from "@/components/molecules/EventCard";
import EventsInfiniteGrid from "@/components/organisms/EventsInfiniteGrid";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";

export default function AllEventsList({
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
      renderItem={(post, index) => (
        <EventCard
          key={post.id}
          priority={index < 4}
          id={post.id}
          title={post.title}
          flyer_public_id={post.flyer_public_id}
          flyer_version={post.flyer_version}
          address={post.address}
          event_code={post.event_code}
          starts_at={post.starts_at}
          ends_at={post.ends_at}
          organizer_id={post.organizer_id}
          occurrences={post.occurrences}
          minTicket={post.minTicket}
          created_at={post.created_at}
          capacity={post.capacity}
          min_price={post.min_price}
          currency={post.currency}
          attendanceCount={post.attendanceCount}
          status={post.status}
        />
      )}
    />
  );
}
