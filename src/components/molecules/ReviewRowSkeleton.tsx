import { Skeleton } from "@/components/ui/skeleton";

// Matches the avatar-led review row rendered by PlaceReviewsSection.tsx /
// EventReviewsSection.tsx (avatar, name + timestamp, rating, body text,
// optional photo grid) -- distinct from ReviewCardSkeleton.tsx, which
// matches UserReviewsList.tsx's own-reviews card (title-led, no avatar).
export default function ReviewRowSkeleton() {
  return (
    <li className="border-b border-border pb-6 last:border-0 last:pb-0">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />

        <div className="flex-1 min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>

        <Skeleton className="h-4 w-16 shrink-0" />
      </div>

      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      <div className="flex gap-2 mt-3">
        <Skeleton className="h-14 w-14 rounded-md" />
        <Skeleton className="h-14 w-14 rounded-md" />
      </div>
    </li>
  );
}
