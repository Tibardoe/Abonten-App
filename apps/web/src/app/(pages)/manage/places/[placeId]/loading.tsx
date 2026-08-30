import { Skeleton } from "@/components/ui/skeleton";

// Simple tabbed-page skeleton for ManagePlaceView -- a tab bar shape (see
// ManagePlaceView.tsx's TABS: Details, Photos, Hours, Services, Reviews,
// Insights) plus one generic content block. Not overbuilt per-tab since the
// Details tab is what's actually shown first.
export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-40 rounded-lg shrink-0" />
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-border pb-px md:justify-center">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton
            key={i.toLocaleString()}
            className="h-8 w-24 shrink-0 rounded-md"
          />
        ))}
      </div>

      <div className="w-full md:w-[70%] md:mx-auto space-y-4">
        <Skeleton className="aspect-video w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  );
}
