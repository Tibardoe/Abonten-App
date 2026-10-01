"use client";

import Rating from "@/components/atoms/Rating";
import InfiniteList from "@/components/organisms/InfiniteList";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { OwnedPlaceReviewListItem } from "@abonten/types/reviewType";
import { ClockIcon, MapPinIcon, UserIcon } from "lucide-react";
import Link from "next/link";

// Sibling of UserReviewsList.tsx rather than a parameterized variant of it —
// a place review is about a specific place (not the profile owner
// directly), so each row needs to show which place it's for, which
// UserReviewsList's row template has no field for.
export default function PlaceReviewsList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<OwnedPlaceReviewListItem>;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<OwnedPlaceReviewListItem>>;
  emptyState: React.ReactNode;
}) {
  return (
    <InfiniteList
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listClassName="flex flex-col gap-6"
      renderItem={(review) => (
        <li
          key={review.id}
          className="w-full bg-card text-card-foreground shadow-sm hover:shadow-md transition rounded-xl p-5 flex flex-col gap-3 border border-border"
        >
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-card-foreground">
              {review.title || "Review"}
            </h2>
            <Rating rating={review.rating} />
          </div>

          {review.comment && (
            <p className="text-foreground text-justify leading-relaxed">
              {review.comment}
            </p>
          )}

          <div className="flex flex-wrap items-center text-sm gap-4 text-muted-foreground">
            <Link
              href={`/places/${review.place?.slug}`}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <MapPinIcon size={16} />
              <span>{review.place?.name}</span>
            </Link>
            <div className="flex items-center gap-1">
              <UserIcon size={16} />
              <span>{review.user_info?.username}</span>
            </div>
            <div className="flex items-center gap-1">
              <ClockIcon size={16} />
              <span>{getRelativeTime(review.created_at)}</span>
            </div>
          </div>
        </li>
      )}
    />
  );
}
