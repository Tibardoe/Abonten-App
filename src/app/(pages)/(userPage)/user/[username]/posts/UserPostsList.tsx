"use client";

import EventCard from "@/components/molecules/EventCard";
import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@/types/pagination";
import type { UserPostType } from "@/types/postsType";

export default function UserPostsList({
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
    <InfiniteList<UserPostType>
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
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
          occurrences={post.event_occurrence}
          min_price={post.min_price}
          currency={post.currency}
          organizer_id={post.organizer_id}
          created_at={post.created_at}
          capacity={post.capacity}
          attendanceCount={post.attendanceCount}
          status={post.status}
        />
      )}
    />
  );
}
