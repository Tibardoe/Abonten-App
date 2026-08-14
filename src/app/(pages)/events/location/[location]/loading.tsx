import EventBannerSkeleton from "@/components/molecules/EventBannerSkeleton";
import EventCardSkeleton from "@/components/molecules/EventCardSkeleton";
import EventsSliderSkeleton from "@/components/organisms/EventsSliderSkeleton";
import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-2">
      <LocationAndFilterSection />

      <EventBannerSkeleton />

      {Array.from({ length: 5 }, (_, i) => (
        <EventsSliderSkeleton key={i.toLocaleString()} />
      ))}

      <div className="mb-5">
        <Skeleton className="h-6 w-32 mb-2" />

        <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <EventCardSkeleton key={i.toLocaleString()} />
          ))}
        </ul>
      </div>
    </section>
  );
}
