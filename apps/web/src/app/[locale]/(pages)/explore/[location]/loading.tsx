import EventsSliderSkeleton from "@/components/organisms/EventsSliderSkeleton";
import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors events/location/[location]/loading.tsx's shape (real
// LocationAndFilterSection + a handful of slider-shaped skeleton rows) since
// this route's Events tab content is structurally the same. The Places tab
// isn't distinguished here -- both tabs are fetched and rendered together by
// the page, so a generic "a few sliders" skeleton covers whichever tab ends
// up active once data loads.
export default function Loading() {
  return (
    <section className="space-y-2">
      <Skeleton className="h-7 w-24" />

      <LocationAndFilterSection />

      <Skeleton className="h-10 w-60 rounded-md" />

      {Array.from({ length: 3 }, (_, i) => (
        <EventsSliderSkeleton key={i.toLocaleString()} />
      ))}
    </section>
  );
}
