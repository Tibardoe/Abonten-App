import ReviewRowSkeleton from "@/components/molecules/ReviewRowSkeleton";
import EventsSliderSkeleton from "@/components/organisms/EventsSliderSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors events/[eventCode]/loading.tsx's hero+sections structure, adapted
// for a Place's own section order (see places/[slug]/page.tsx): hero,
// actions row, about, hours, services, photos, then reviews.
export default function Loading() {
  return (
    <div className="bg-background">
      {/* Hero Section */}
      <div className="relative h-72 md:h-[500px] bg-muted overflow-hidden">
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 space-y-2 md:space-y-4">
          <Skeleton className="h-9 md:h-12 w-3/4 md:w-1/2 bg-white/20" />
          <div className="flex flex-wrap gap-2 items-center">
            <Skeleton className="h-8 w-24 rounded-full bg-white/20" />
            <Skeleton className="h-8 w-28 rounded-full bg-white/20" />
            <Skeleton className="h-8 w-20 rounded-full bg-white/20" />
          </div>
          <Skeleton className="h-4 w-2/3 bg-white/20" />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-2 lg:px-8 py-8 md:py-12">
        <div className="md:grid lg:grid-cols-3 gap-6 md:gap-8 flex flex-col mb-5">
          <div className="lg:col-span-2 space-y-6 md:space-y-8">
            {/* Actions row */}
            <div className="bg-card rounded-xl p-4 md:p-6 shadow-sm">
              <div className="flex flex-wrap gap-3">
                <Skeleton className="h-10 w-28 rounded-md" />
                <Skeleton className="h-10 w-28 rounded-md" />
                <Skeleton className="h-10 w-28 rounded-md" />
              </div>
            </div>

            {/* About */}
            <div className="bg-card rounded-xl p-4 md:p-6 shadow-sm space-y-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>

            {/* Opening Hours */}
            <div className="bg-card rounded-xl p-4 md:p-6 shadow-sm space-y-3">
              <Skeleton className="h-6 w-36" />
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i.toLocaleString()} className="h-4 w-full" />
                ))}
              </div>
            </div>

            {/* Services */}
            <div className="bg-card rounded-xl p-4 md:p-6 shadow-sm space-y-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>

            {/* Photos */}
            <div className="bg-card rounded-xl p-4 md:p-6 shadow-sm space-y-3">
              <Skeleton className="h-6 w-20" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton
                    key={i.toLocaleString()}
                    className="aspect-square rounded-lg"
                  />
                ))}
              </div>
            </div>

            {/* Reviews */}
            <div className="bg-card rounded-xl p-4 md:p-6 shadow-sm space-y-4">
              <Skeleton className="h-6 w-24" />
              <ul className="flex flex-col gap-6">
                {Array.from({ length: 2 }, (_, i) => (
                  <ReviewRowSkeleton key={i.toLocaleString()} />
                ))}
              </ul>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 md:space-y-6">
            <div className="bg-card rounded-xl p-4 md:p-6 shadow-sm space-y-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-full" />
            </div>

            <div className="bg-card rounded-xl p-4 md:p-6 shadow-sm space-y-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        </div>

        <EventsSliderSkeleton />
      </div>
    </div>
  );
}
