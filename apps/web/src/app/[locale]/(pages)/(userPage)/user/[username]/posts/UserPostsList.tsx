"use client";

import EventCard from "@/components/molecules/EventCard";
import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";

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
          {...post}
          occurrences={post.event_occurrence}
        />
      )}
    />
  );
}
