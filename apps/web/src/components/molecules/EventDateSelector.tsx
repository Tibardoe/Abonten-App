"use client";

import type { Occurrence } from "@/types/occurrenceType";
import { formatFullDateTimeRange, getDateParts } from "@/utils/dateFormatter";
import React, { useState } from "react";
import AttendingButton from "../atoms/AttendingButton";
import CheckoutBtn from "../atoms/CheckoutBtn";
import DateBtn from "../atoms/DateBtn";

type EventDateSelectorProps = {
  eventDates: Occurrence[];
  eventId: string;
  eventTitle: string;
  time: string;
  requireRegistration?: boolean;
  soldOut?: boolean;
  isAbsolutelyFreeEvent?: boolean;
  eventStatus?: string;
};

export default function EventDateSelector({
  eventDates,
  eventId,
  eventTitle,
  requireRegistration,
  soldOut,
  isAbsolutelyFreeEvent,
  eventStatus,
}: EventDateSelectorProps) {
  const now = new Date();

  const sortedEventDates = [...eventDates].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  const nearestUpcomingOccurrence =
    sortedEventDates.find((occ) => new Date(occ.ends_at) >= now) ?? null;

  const [selectedOccurrence, setSelectedOccurrence] =
    useState<Occurrence | null>(nearestUpcomingOccurrence);

  // The buy/attend CTA previously had no cancelled-awareness at all for paid
  // events (CheckoutBtn never received eventStatus) and silently rendered
  // nothing once every occurrence had ended, instead of saying so. Gating
  // both CTAs here, once, fixes both: a cancelled event never shows a
  // working "Buy Ticket"/"I'm Attending" button regardless of its dates, and
  // a fully-ended event says so instead of leaving blank space.
  const isCanceled = eventStatus === "canceled";
  const hasEnded = !nearestUpcomingOccurrence;

  const selectedDateTime = selectedOccurrence
    ? formatFullDateTimeRange(
        selectedOccurrence.starts_at,
        selectedOccurrence.ends_at,
      )
    : null;

  return (
    <div className="flex flex-col gap-3">
      {sortedEventDates.length > 0 && (
        <div className="mb-3 p-2">
          <h2 className="font-bold mb-2">Dates</h2>
          <div className="flex overflow-x-auto gap-3">
            {sortedEventDates.map((occurrence, index) => {
              const dateValue = occurrence.starts_at;

              const { day, month, date, time } = getDateParts(dateValue);

              const isPast = new Date(occurrence.ends_at) < new Date();

              const isActive =
                !isPast && selectedOccurrence?.starts_at === dateValue;

              return (
                <DateBtn
                  // occurrence.id is absent for single-date events (see
                  // page.tsx) — it's deliberately not fabricated there since
                  // it flows downstream as the RSVP/checkout occurrenceId,
                  // so fall back to the index for the list key here instead.
                  key={occurrence.id ?? `date-${index}`}
                  dateString={occurrence.starts_at.toString()}
                  onClick={() => {
                    if (!isPast) {
                      setSelectedOccurrence(occurrence);
                    }
                  }}
                  day={day}
                  month={month}
                  date={date}
                  isActive={isActive}
                  start_at={time}
                  is_past={isPast}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Buy ticket / RSVP btn */}
      {isCanceled || hasEnded ? (
        <button
          type="button"
          disabled
          className="font-bold rounded-lg w-full p-6 text-lg bg-muted text-muted-foreground cursor-not-allowed"
        >
          {isCanceled ? "Event Canceled" : "Event Ended"}
        </button>
      ) : (
        selectedDateTime &&
        (isAbsolutelyFreeEvent ? (
          requireRegistration && (
            <AttendingButton
              eventId={eventId}
              occurrenceId={selectedOccurrence?.id ?? null}
              eventStatusRaw={eventStatus ?? "published"}
              eventDates={eventDates}
              soldOut={soldOut}
            />
          )
        ) : (
          <CheckoutBtn
            eventId={eventId}
            occurrenceId={selectedOccurrence?.id ?? null}
            btnText="Buy Ticket"
            eventTitle={eventTitle}
            date={selectedDateTime.date}
            time={selectedDateTime.time}
            soldOut={soldOut}
          />
        ))
      )}
    </div>
  );
}
