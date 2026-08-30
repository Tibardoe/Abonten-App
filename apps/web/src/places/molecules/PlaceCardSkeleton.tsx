import { Skeleton } from "@/components/ui/skeleton";

// Mirrors PlaceCard.tsx's structure (see that file), the same way
// EventCardSkeleton.tsx mirrors EventCard.tsx.
export default function PlaceCardSkeleton() {
  return (
    <li className="overflow-hidden rounded-xl shadow-lg bg-card border border-border">
      <Skeleton className="h-64 w-full rounded-none" />

      <div className="p-5 space-y-3">
        <div className="flex justify-between items-start gap-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
        </div>

        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>

          <Skeleton className="h-4 w-full" />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      </div>
    </li>
  );
}
