"use client";

import { useAttendingEventIds } from "@/hooks/useAttendingEventIds";
import type { UserPostType } from "@/types/postsType";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { getFormattedEventDate } from "@/utils/dateFormatter";
import { getEventStatus } from "@/utils/eventStatus";
import { getEventSoldOutStatus } from "@/utils/getEventSoldOutStatus";
import { getEventStatusOverlay } from "@/utils/getEventStatusOverlay";
import { IoLocationOutline, IoTimeOutline } from "react-icons/io5";
import { MdConfirmationNumber, MdOutlineDateRange } from "react-icons/md";
import EventCardMenuBtn from "../atoms/EventCardMenuBtn";
import DiscoveryCardCoverImage from "./DiscoveryCardCoverImage";
import DiscoveryCardTitleRow from "./DiscoveryCardTitleRow";

export default function EventCard({
  title,
  flyer_public_id,
  flyer_version,
  address,
  starts_at,
  ends_at,
  occurrences,
  min_price,
  attendanceCount,
  attendance_count,
  currency,
  capacity,
  id,
  event_code,
  status,
  organizer_id,
  priority,
}: UserPostType & { priority?: boolean }) {
  const dateTime = getFormattedEventDate(starts_at, ends_at, occurrences);
  const overlayMessage = getEventStatusOverlay(starts_at, ends_at, occurrences);
  const attendees = attendanceCount ?? attendance_count ?? 0;
  const soldOut = getEventSoldOutStatus({
    capacity,
    attendeeCount: attendees,
  });
  const eventHref = `/events/${event_code.toLowerCase()}`;

  // "You're Going" only makes sense while the event is still actually
  // attendable: not cancelled, and not already over. `getEventStatus` is the
  // shared source of truth for the lifecycle state (upcoming/ongoing/ended),
  // so the badge condition can't drift from the "Event Ended" overlay above.
  const lifecycleStatus = getEventStatus(starts_at, ends_at, occurrences);
  const showAttendingBadge =
    useAttendingEventIds().has(id) &&
    status !== "canceled" &&
    lifecycleStatus !== "ended";

  return (
    // `isolate` traps the "You're Going" badge's z-index inside the card so
    // it can never paint over the sticky header, bottom nav, modals, or
    // dropdowns (all of which live in higher page-level layers).
    <li className="relative group isolate overflow-hidden rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 bg-card border border-border hover:border-primary/40">
      <DiscoveryCardCoverImage
        href={eventHref}
        src={buildCloudinaryUrl(flyer_public_id, flyer_version, {
          width: 420,
          height: 256,
        })}
        alt={`Flyer for ${title}`}
        priority={priority}
        cornerBadge={
          showAttendingBadge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-semibold text-success-foreground shadow-md">
              <MdConfirmationNumber className="text-sm" />
              You're Going
            </span>
          )
        }
        centerOverlay={
          // Scoped to the flyer image only (not the whole card, which
          // previously sat on top of the title/menu/metadata below and
          // silently blocked clicking any of them whenever an event was
          // Ongoing/Sold Out/Canceled).
          (status === "canceled" || soldOut || overlayMessage) && (
            <div
              className={`absolute inset-0 z-10 flex items-center justify-center pointer-events-none
              ${status === "canceled" ? "bg-red-900/80" : "bg-black/70"}
              backdrop-blur-sm text-mint font-bold text-lg md:text-xl p-4 text-center`}
            >
              {status === "canceled"
                ? "Event Canceled"
                : soldOut
                  ? "Sold Out"
                  : overlayMessage}
            </div>
          )
        }
      />

      {/* Card Content */}
      <div className="p-5 space-y-3">
        <DiscoveryCardTitleRow
          href={eventHref}
          title={title}
          action={
            <EventCardMenuBtn
              eventId={id}
              eventTitle={title}
              eventCode={event_code}
              address={address.full_address}
              organizerId={organizer_id}
              eventStatus={status}
            />
          }
        />

        {/* Event Metadata */}
        <div className="space-y-2.5">
          {/* Location */}
          <div className="flex items-start gap-2 text-foreground">
            <IoLocationOutline className="mt-0.5 flex-shrink-0 text-lg text-muted-foreground" />
            <p className="text-sm line-clamp-2">
              {address?.full_address || "Location not specified"}
            </p>
          </div>

          {/* Date & Time */}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 text-foreground">
              <MdOutlineDateRange className="text-lg text-muted-foreground" />
              <span className="text-sm">
                {dateTime?.date || "Date not available"}
              </span>
            </div>

            <div className="flex items-center gap-2 text-foreground">
              <IoTimeOutline className="text-lg text-muted-foreground" />
              <span className="text-sm">
                {dateTime?.time || "Time not available"}
              </span>
            </div>
          </div>

          {/* Capacity & Attendance */}
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="px-2 py-1 bg-muted rounded-full">
                {capacity && capacity > 0
                  ? `${Math.max(capacity - attendees, 0)} spots left`
                  : "Unlimited"}
              </span>
              <span className="px-2 py-1 bg-muted rounded-full">
                {attendees} attending
              </span>
            </div>

            {/* Price Badge */}
            <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-primary text-primary-foreground">
              {min_price === 0 || min_price === null
                ? "Free Entry"
                : `${currency} ${min_price?.toLocaleString()}`}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
