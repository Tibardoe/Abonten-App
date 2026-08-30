"use client";

import InfiniteScrollStatus from "@/components/molecules/InfiniteScrollStatus";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import type { PaginatedResult } from "@/types/pagination";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback } from "react";

type InfiniteListProps<T> = {
  queryKey: unknown[];
  initialPage: PaginatedResult<T> | null;
  fetchPage: (cursor: string | null) => Promise<PaginatedResult<T>>;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyState: React.ReactNode;
  listClassName?: string;
  listElement?: "ul" | "div";
  loadingSkeleton?: React.ReactNode;
};

/**
 * Generic infinite-scroll list shared by every paginated domain in the app
 * (events, favorites, posts, tickets, reviews, transactions, attendees).
 * Seeds TanStack Query's infinite query with the Server Component's
 * already-fetched page 1 (`initialData`), so first paint is unchanged;
 * `fetchPage` is an inline "use server" closure the caller defines to
 * resume with a given cursor.
 */
export default function InfiniteList<T>({
  queryKey,
  initialPage,
  fetchPage,
  renderItem,
  emptyState,
  listClassName,
  listElement = "ul",
  loadingSkeleton,
}: InfiniteListProps<T>) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.nextCursor : undefined,
    initialData: initialPage
      ? { pages: [initialPage], pageParams: [null] }
      : undefined,
  });

  const items = data?.pages.flatMap((page) => page.data) ?? [];

  const handleIntersect = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const sentinelRef = useInfiniteScrollSentinel({
    onIntersect: handleIntersect,
    enabled: !!hasNextPage && !isFetchingNextPage && !isFetchNextPageError,
  });

  if (isLoading && loadingSkeleton) {
    return <>{loadingSkeleton}</>;
  }

  if (isError && items.length === 0) {
    return (
      <InlineErrorRetry
        message="We couldn't load this list."
        onRetry={() => refetch()}
      />
    );
  }

  if (items.length === 0) {
    return <>{emptyState}</>;
  }

  const List = listElement;

  return (
    <div>
      <List className={listClassName}>
        {items.map((item, index) => renderItem(item, index))}
      </List>

      <div ref={sentinelRef} aria-hidden className="h-px" />

      <InfiniteScrollStatus
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={!!hasNextPage}
        isError={isFetchNextPageError}
        onRetry={() => fetchNextPage()}
        itemCount={items.length}
      />
    </div>
  );
}
