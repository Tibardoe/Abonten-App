import EventsSliderSkeleton from "@/components/organisms/EventsSliderSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function WeeklyEditionSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-7xl flex-col gap-8"
      aria-busy="true"
      aria-label="Loading Abonten Weekly"
    >
      <div className="space-y-3 rounded-2xl border border-border p-5 md:p-8">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-3/4 max-w-xl" />
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <EventsSliderSkeleton />
      <EventsSliderSkeleton />
    </div>
  );
}
