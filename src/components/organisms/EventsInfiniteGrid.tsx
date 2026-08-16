"use client";

import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@/types/pagination";
import type { UserPostType } from "@/types/postsType";

type EventsInfiniteGridProps = {
  queryKey: unknown[];
  initialPage: PaginatedResult<UserPostType>;
  fetchPage: (cursor: string | null) => Promise<PaginatedResult<UserPostType>>;
  renderItem: (event: UserPostType, index: number) => React.ReactNode;
  emptyState: React.ReactNode;
  listClassName?: string;
};

/** Events-domain specialization of the shared `InfiniteList`. */
export default function EventsInfiniteGrid({
  listClassName = "grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-3",
  ...props
}: EventsInfiniteGridProps) {
  return (
    <InfiniteList<UserPostType> listClassName={listClassName} {...props} />
  );
}
