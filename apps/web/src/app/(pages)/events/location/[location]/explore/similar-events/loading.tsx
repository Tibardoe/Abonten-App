import EventCardSkeleton from "@/components/molecules/EventCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-7 w-40" />

      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 pb-5">
        {Array.from({ length: 8 }, (_, i) => (
          <EventCardSkeleton key={i.toLocaleString()} />
        ))}
      </ul>
    </div>
  );
}
