import EventCardSkeleton from "@/components/molecules/EventCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function EventsSliderSkeleton() {
  return (
    <div>
      <div className="flex justify-between font-medium text-lg">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-6 w-16" />
      </div>

      <ul className="grid grid-flow-col auto-cols-[90%] sm:auto-cols-[45%] md:auto-cols-[35%] lg:auto-cols-[28%] xl:auto-cols-[25%] gap-1 overflow-x-hidden pb-3 mt-2">
        {Array.from({ length: 4 }, (_, i) => (
          <EventCardSkeleton key={i.toLocaleString()} />
        ))}
      </ul>
    </div>
  );
}
