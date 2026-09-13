import { Skeleton, TableSkeleton } from "./Skeleton";

// The shape of every list page while its rows load: a heading, a filter
// row and a table, so nothing jumps when the data lands.
export function ListLoading() {
  return (
    <output aria-live="polite" className="block">
      <span className="sr-only">Loading…</span>
      <div className="mb-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="mb-3 flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      <TableSkeleton rows={8} cols={5} />
    </output>
  );
}
