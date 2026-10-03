"use client";

import EventCard from "@/components/molecules/EventCard";
import EventsInfiniteGrid from "@/components/organisms/EventsInfiniteGrid";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";

export default function SearchTitleResultsList({
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
        <EventCard key={event.id} priority={index < 4} {...event} />
      )}
    />
  );
}
