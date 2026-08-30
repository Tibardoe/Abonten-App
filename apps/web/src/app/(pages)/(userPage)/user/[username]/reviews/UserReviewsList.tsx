"use client";

import Rating from "@/components/atoms/Rating";
import InfiniteList from "@/components/organisms/InfiniteList";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import type { PaginatedResult } from "@abonten/types/pagination";
import { ClockIcon, UserIcon } from "lucide-react";

export default function UserReviewsList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  initialPage: PaginatedResult<any>;
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  fetchPage: (cursor: string | null) => Promise<PaginatedResult<any>>;
  emptyState: React.ReactNode;
}) {
  return (
    <InfiniteList
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listClassName="flex flex-col gap-6"
      // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
      renderItem={(review: any) => (
        <li
          key={review.id}
          className="w-full bg-card text-card-foreground shadow-sm hover:shadow-md transition rounded-xl p-5 flex flex-col gap-3 border border-border"
        >
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-card-foreground">
              {review.title}
            </h2>
            <Rating rating={review.rating} />
          </div>

          <p className="text-foreground text-justify leading-relaxed">
            {review.comment}
          </p>

          <div className="flex flex-wrap items-center text-sm gap-4 text-muted-foreground">
            <div className="flex items-center gap-1">
              <UserIcon size={16} />
              <span>{review.user_info.username}</span>
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
