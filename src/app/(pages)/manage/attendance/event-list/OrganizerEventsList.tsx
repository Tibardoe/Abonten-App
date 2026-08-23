"use client";

import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@/types/pagination";
import type { UserPostType } from "@/types/postsType";
import { getFormattedEventDate } from "@/utils/dateFormatter";
import Link from "next/link";
import { FaChevronRight } from "react-icons/fa";
import { IoTimeOutline } from "react-icons/io5";
import { MdOutlineDateRange } from "react-icons/md";

export default function OrganizerEventsList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<UserPostType>;
  fetchPage: (cursor: string | null) => Promise<PaginatedResult<UserPostType>>;
  emptyState: React.ReactNode;
}) {
  return (
    <InfiniteList<UserPostType>
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listClassName="flex flex-col gap-2 mb-5"
      renderItem={(event) => {
        const dateTime = getFormattedEventDate(
          event.starts_at,
          event.ends_at,
          event.occurrences,
        );

        return (
          <li
            key={event.id}
            className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4 space-y-2"
          >
            <div className="flex justify-between items-center">
              <Link href={`/manage/events/${event.id}`}>
                <h2 className="font-bold">{event.title}</h2>
              </Link>

              <Link href={`/manage/events/${event.id}`}>
                <FaChevronRight className="md:text-xl" />
              </Link>
            </div>

            <div className="flex items-center gap-2">
              <MdOutlineDateRange className="text-xl shrink-0" />
              <p className="text-sm text-muted-foreground">
                {dateTime ? dateTime.date : "Date not available"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <IoTimeOutline className="text-xl shrink-0" />
              <p className="text-sm text-muted-foreground">
                {dateTime ? dateTime.time : "Date not available"}
              </p>
            </div>
          </li>
        );
      }}
    />
  );
}
