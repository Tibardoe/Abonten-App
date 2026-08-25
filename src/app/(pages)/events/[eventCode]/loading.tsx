import EventsSliderSkeleton from "@/components/organisms/EventsSliderSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="bg-background">
      {/* Hero Section */}
      <div className="relative h-72 md:h-[500px] bg-muted overflow-hidden">
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 space-y-3 md:space-y-4">
          <Skeleton className="h-9 md:h-12 w-3/4 md:w-1/2 bg-white/20" />
          <div className="flex flex-wrap gap-2 items-center">
            <Skeleton className="h-8 w-32 rounded-full bg-white/20" />
            <Skeleton className="h-8 w-36 rounded-full bg-white/20" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-2 lg:px-8 py-8 md:py-12">
        <div className="md:grid lg:grid-cols-3 gap-6 md:gap-8 flex flex-col mb-5">
          {/* Event Details */}
          <div className="lg:col-span-2 space-y-6 md:space-y-8">
            {/* Organizer Card */}
            <div className="bg-card rounded-xl p-4 md:p-6 shadow-sm">
              <div className="flex items-center gap-3 md:gap-4">
                <Skeleton className="w-14 h-14 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-4 w-24 shrink-0" />
              </div>
            </div>

            {/* Event Info Grid */}
            <div className="grid md:grid-cols-2 gap-3 md:gap-4">
              <div className="bg-card p-4 md:p-6 rounded-xl shadow-sm space-y-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-9 w-32 rounded-md" />
              </div>

              <div className="bg-card p-4 md:p-6 rounded-xl shadow-sm space-y-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>

            {/* Description */}
            <div className="bg-card rounded-xl p-4 md:p-6 shadow-sm space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>

            {/* Ticket CTA */}
            <div className="bg-card rounded-xl shadow-lg p-4 md:p-6 space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-11 w-full rounded-md" />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 md:space-y-6">
            <div className="bg-card rounded-xl p-4 md:p-6 shadow-sm space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-full rounded-full" />
            </div>

            <div className="bg-card rounded-xl p-4 md:p-6 shadow-sm space-y-3">
              <Skeleton className="h-5 w-24" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        <EventsSliderSkeleton />
      </div>
    </div>
  );
}
