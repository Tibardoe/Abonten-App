import EventListRowSkeleton from "@/components/molecules/EventListRowSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors manage/attendance/event-list/loading.tsx's simple list-row
// skeleton -- OrganizerPlacesList renders the same "small image + title +
// subtitle + chevron" row shape as EventListRowSkeleton, so it's reused
// as-is rather than adding a near-identical Places-specific skeleton.
export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-6 w-32" />

      <ul className="flex flex-col gap-2 mb-5">
        {Array.from({ length: 5 }, (_, i) => (
          <EventListRowSkeleton key={i.toLocaleString()} />
        ))}
      </ul>
    </div>
  );
}
