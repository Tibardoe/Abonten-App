"use client";

import type { UserPostType } from "@/types/postsType";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { getFormattedEventDate } from "@/utils/dateFormatter";
import { getEventSoldOutStatus } from "@/utils/getEventSoldOutStatus";
import { getEventStatusOverlay } from "@/utils/getEventStatusOverlay";
import Image from "next/image";
import Link from "next/link";
import { IoLocationOutline, IoTimeOutline } from "react-icons/io5";
import { MdOutlineDateRange } from "react-icons/md";
import EventCardMenuBtn from "../atoms/EventCardMenuBtn";

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

  return (
    <li className="relative group overflow-hidden rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 bg-card border border-border hover:border-primary/40">
      {/* Status Overlays */}
      {(status === "canceled" || soldOut || overlayMessage) && (
        <div
          className={`absolute inset-0 z-10 flex items-center justify-center
          ${status === "canceled" ? "bg-red-900/80" : "bg-black/70"}
          backdrop-blur-sm text-mint font-bold text-lg md:text-xl p-4 text-center`}
        >
          {status === "canceled"
            ? "Event Canceled"
            : soldOut
              ? "Sold Out"
              : overlayMessage}
        </div>
      )}

      {/* Flyer Image */}
      <Link
        href={`/events/${event_code.toLowerCase()}`}
        className="block relative h-64 w-full overflow-hidden"
      >
        <Image
          src={buildCloudinaryUrl(flyer_public_id, flyer_version, {
            width: 420,
            height: 256,
          })}
          alt={`Flyer for ${title}`}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          priority={priority}
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </Link>

      {/* Card Content */}
      <div className="p-5 space-y-3">
        <div className="flex justify-between items-start gap-3">
          <Link
            href={`/events/${event_code.toLowerCase()}`}
            className="text-lg font-medium text-card-foreground hover:text-primary transition-colors line-clamp-2"
            title={title}
          >
            {title}
          </Link>

          <EventCardMenuBtn
            eventId={id}
            eventTitle={title}
            eventCode={event_code}
            address={address.full_address}
            organizerId={organizer_id}
          />
        </div>

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
                {capacity && capacity > 0 ? `${capacity} spots` : "Unlimited"}
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
