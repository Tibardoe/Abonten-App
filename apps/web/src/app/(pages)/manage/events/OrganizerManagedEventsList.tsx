"use client";

import InfiniteList from "@/components/organisms/InfiniteList";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import { getEventStatusOverlay } from "@abonten/core/getEventStatusOverlay";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";
import Image from "next/image";
import Link from "next/link";
import { FaChevronRight } from "react-icons/fa";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  canceled: {
    label: "Cancelled",
    className: "bg-destructive/10 text-destructive",
  },
  completed: {
    label: "Completed",
    className: "bg-muted text-muted-foreground",
  },
};

// Minimal management-list row (not the rich public EventCard) -- mirrors
// OrganizerPlacesList.tsx's row shape exactly: thumbnail, title, one line
// of status/metadata, a chevron linking into the management page. Part 3 of
// the Unified Event Management spec asks for "quickly identify an event and
// select it" -- not an overloaded card.
export default function OrganizerManagedEventsList({
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
        const overlayStatus = getEventStatusOverlay(
          event.starts_at,
          event.ends_at,
          event.occurrences,
        );
        const draftOrTerminalStatus =
          event.status && STATUS_LABELS[event.status]
            ? STATUS_LABELS[event.status]
            : null;

        return (
          <li
            key={event.id}
            className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4"
          >
            <Link
              href={`/manage/events/${event.id}`}
              className="flex items-center gap-3"
            >
              <div className="relative w-14 h-14 shrink-0 rounded-md overflow-hidden bg-muted">
                <Image
                  src={buildCloudinaryUrl(
                    event.flyer_public_id ?? "",
                    event.flyer_version ?? "",
                    { width: 112, height: 112 },
                  )}
                  alt={event.title}
                  fill
                  className="object-cover"
                />
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="font-bold truncate">{event.title}</h2>
                <p className="text-sm text-muted-foreground truncate">
                  {dateTime?.date ?? "Date not available"}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {draftOrTerminalStatus && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${draftOrTerminalStatus.className}`}
                    >
                      {draftOrTerminalStatus.label}
                    </span>
                  )}
                  {!draftOrTerminalStatus && overlayStatus && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                      {overlayStatus}
                    </span>
                  )}
                  {event.capacity ? (
                    <span className="text-xs text-muted-foreground">
                      Capacity: {event.capacity}
                    </span>
                  ) : null}
                </div>
              </div>

              <FaChevronRight className="shrink-0 md:text-xl" />
            </Link>
          </li>
        );
      }}
    />
  );
}
