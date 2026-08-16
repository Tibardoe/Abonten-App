"use client";

type InfiniteScrollStatusProps = {
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  isError: boolean;
  onRetry: () => void;
  itemCount: number;
};

export default function InfiniteScrollStatus({
  isFetchingNextPage,
  hasNextPage,
  isError,
  onRetry,
  itemCount,
}: InfiniteScrollStatusProps) {
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Couldn’t load more events.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (isFetchingNextPage) {
    return (
      <div className="flex items-center justify-center gap-2 py-6">
        <div className="border-2 border-primary border-t-transparent animate-spin rounded-full w-5 h-5 shrink-0" />
        <span className="text-sm text-muted-foreground">Loading more…</span>
      </div>
    );
  }

  if (!hasNextPage && itemCount > 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        You’ve reached the end
      </p>
    );
  }

  return null;
}
