"use client";

import { useAttendingEventIds } from "@/hooks/useAttendingEventIds";
import { useMarketContext } from "@/hooks/useMarketContext";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import { getEventStatus } from "@abonten/core/eventStatus";
import { formatMoney } from "@abonten/core/formatMoney";
import {
  getEventSoldOutStatus,
  getEventSpotsLeft,
} from "@abonten/core/getEventSoldOutStatus";
import { getEventStatusOverlay } from "@abonten/core/getEventStatusOverlay";
import type { UserPostType } from "@abonten/types/postsType";
import { useLocale, useTranslations } from "next-intl";
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
  timezone,
  ticket_type,
  priority,
}: UserPostType & { priority?: boolean }) {
  const locale = useLocale();

  const t = useTranslations("common");
  const tc = useTranslations("core");

  // "≈ £12" beside a price in another currency, when estimates are on.
  const { estimate } = useMarketContext();
  const approx = estimate(min_price, currency);
  const dateTime = getFormattedEventDate(
    starts_at,
    ends_at,
    occurrences,
    timezone,
    locale,
  );
  const overlayMessage = getEventStatusOverlay(
    tc,
    starts_at,
    ends_at,
    occurrences,
  );
  const attendees = attendanceCount ?? attendance_count ?? 0;
  // Room under the headcount cap and stock left in the ticket tiers are two
  // separate limits; the list rows carry both (`ticket_type` holds each
  // tier's remaining stock), so the card counts the smaller.
  const soldOut = getEventSoldOutStatus({
    capacity,
    attendeeCount: attendees,
    ticketTypes: ticket_type,
  });
  const eventHref = `/events/${event_code.toLowerCase()}`;
  // Scarcity and turnout are shown only when they say something: "300 spots
  // left" on a new event and "0 attending" read as noise (or as a warning
  // sign), so the chips appear once places are running low or people are
  // actually going.
  const spotsLeft = getEventSpotsLeft({
    capacity,
    attendeeCount: attendees,
    ticketTypes: ticket_type,
  });
  const fewSpotsLeft =
    spotsLeft !== null &&
    spotsLeft > 0 &&
    (spotsLeft <= 20 || spotsLeft <= (capacity ?? 0) * 0.1);

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
        alt={t("flyerFor", { title: title })}
        priority={priority}
        cornerBadge={
          showAttendingBadge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-semibold text-success-foreground shadow-md">
              <MdConfirmationNumber className="text-sm" />
              {t("youReGoing")}
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
                ? t("cancelled")
                : soldOut
                  ? t("soldOut")
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
              {address?.full_address || t("locationNotSpecified")}
            </p>
          </div>

          {/* Date & Time */}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 text-foreground">
              <MdOutlineDateRange className="text-lg text-muted-foreground" />
              <span className="text-sm">
                {dateTime?.date || t("dateNotAvailable")}
              </span>
            </div>

            <div className="flex items-center gap-2 text-foreground">
              <IoTimeOutline className="text-lg text-muted-foreground" />
              <span className="text-sm">
                {dateTime?.time || t("timeNotAvailable")}
              </span>
            </div>
          </div>

          {/* Capacity & Attendance */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {fewSpotsLeft && (
                <span className="px-2 py-1 rounded-full bg-warning/15 font-medium text-warning-foreground dark:text-warning">
                  {t("onlyLeft", { spotsLeft: spotsLeft })}
                </span>
              )}
              {attendees > 0 && (
                <span className="px-2 py-1 bg-muted rounded-full">
                  {t("going3", { attendees: attendees })}
                </span>
              )}
            </div>

            {/* Price Badge */}
            <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-primary text-primary-foreground">
              {min_price === 0 || min_price === null
                ? t("free")
                : `${formatMoney(currency, min_price, { trimZeroFraction: true, locale })}${
                    approx ? ` · ${approx}` : ""
                  }`}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
