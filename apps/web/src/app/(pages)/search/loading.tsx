import EventCardSkeleton from "@/components/molecules/EventCardSkeleton";
import FilterSearchBar from "@/components/molecules/FilterSearchBar";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <FilterSearchBar />

      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-11 w-24 rounded-lg" />
        <Skeleton className="h-11 w-28 rounded-lg" />
        <Skeleton className="h-11 w-20 rounded-lg" />
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5">
        {Array.from({ length: 8 }, (_, i) => (
          <EventCardSkeleton key={i.toLocaleString()} />
        ))}
      </ul>
    </div>
  );
}
