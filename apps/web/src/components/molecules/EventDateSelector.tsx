"use client";

import {
  formatFullDateTimeRange,
  getDateParts,
} from "@abonten/core/dateFormatter";
import { resolveOccurrenceState } from "@abonten/core/eventPurchaseEligibility";
import type { Occurrence } from "@abonten/types/occurrenceType";
import React, { useEffect, useState } from "react";
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
  // Re-render on a fixed cadence so a tab left open across an occurrence's
  // start/end time recomputes which date is selectable (and whether the CTA
  // should flip to "Event Ended"/"In Progress" or forward to the next date)
  // without the visitor having to reload. 30s is well inside any realistic
  // "buy right as it starts" window.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();

  const sortedEventDates = [...eventDates].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  // Authoritative per-occurrence breakdown against the current clock. A
  // ticket can only ever be sold for a strictly-future occurrence, so the
  // default selection is `nextPurchasable` (the earliest not-yet-started
  // date), never an ongoing or past one.
  const occurrenceState = resolveOccurrenceState(
    undefined,
    undefined,
    sortedEventDates,
    now.getTime(),
  );
  const nextPurchasable = occurrenceState.nextPurchasable;

  const [selectedStartsAt, setSelectedStartsAt] = useState<string | null>(
    nextPurchasable ? String(nextPurchasable.starts_at) : null,
  );

  // If the tick advanced past the previously-selected date, fall back to the
  // next purchasable one so the CTA never points at a started occurrence.
  const selectedOccurrence =
    sortedEventDates.find(
      (occ) =>
        String(occ.starts_at) === selectedStartsAt &&
        new Date(occ.starts_at).getTime() > now.getTime(),
    ) ??
    nextPurchasable ??
    null;

  const isCanceled = eventStatus === "canceled";
  const blockedLabel = isCanceled
    ? "Event Canceled"
    : occurrenceState.blockReason === "ended"
      ? "Event Ended"
      : occurrenceState.blockReason === "ongoing_no_future"
        ? "Event In Progress"
        : null;

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

              // Only a strictly-future occurrence is selectable: an ongoing
              // one can't be bought for (walk-up sales are closed once it
              // starts) and a finished one obviously can't.
              const isSelectable =
                new Date(occurrence.starts_at).getTime() > now.getTime();

              const isActive =
                isSelectable &&
                selectedOccurrence != null &&
                String(selectedOccurrence.starts_at) === String(dateValue);

              return (
                <DateBtn
                  // occurrence.id is absent for single-date events (see
                  // page.tsx) — it's deliberately not fabricated there since
                  // it flows downstream as the RSVP/checkout occurrenceId,
                  // so fall back to the index for the list key here instead.
                  key={occurrence.id ?? `date-${index}`}
                  dateString={occurrence.starts_at.toString()}
                  onClick={() => {
                    if (isSelectable) {
                      setSelectedStartsAt(String(dateValue));
                    }
                  }}
                  day={day}
                  month={month}
                  date={date}
                  isActive={isActive}
                  start_at={time}
                  is_past={!isSelectable}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Buy ticket / RSVP btn */}
      {blockedLabel ? (
        <button
          type="button"
          disabled
          className="font-bold rounded-lg w-full p-6 text-lg bg-muted text-muted-foreground cursor-not-allowed"
        >
          {blockedLabel}
        </button>
      ) : (
        selectedDateTime &&
        selectedOccurrence &&
        (isAbsolutelyFreeEvent ? (
          requireRegistration && (
            <AttendingButton
              eventId={eventId}
              occurrenceId={selectedOccurrence.id ?? null}
              eventStatusRaw={eventStatus ?? "published"}
              eventDates={eventDates}
              soldOut={soldOut}
            />
          )
        ) : (
          <CheckoutBtn
            eventId={eventId}
            occurrenceId={selectedOccurrence.id ?? null}
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
