"use client";

import {
  formatFullDateTimeRange,
  getDateParts,
} from "@abonten/core/dateFormatter";
import {
  isSessionOnSale,
  resolveOccurrenceState,
  salesCloseClock,
  sessionSalesCloseAt,
} from "@abonten/core/eventPurchaseEligibility";
import type { Occurrence } from "@abonten/types/occurrenceType";
import { useLocale, useTranslations } from "next-intl";
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
  /** Postponed with no new date yet: nothing is on sale. */
  postponed?: boolean;
  /** The event's zone: every date and time reads on the venue's clock. */
  timeZone?: string | null;
  /**
   * When online sales close (event.sales_close_before_end_minutes): null =
   * at the start, else minutes before the end, so a date that is on can
   * still be bought.
   */
  salesCloseBeforeEndMinutes?: number | null;
};

export default function EventDateSelector({
  eventDates,
  eventId,
  eventTitle,
  requireRegistration,
  soldOut,
  isAbsolutelyFreeEvent,
  eventStatus,
  postponed,
  timeZone,
  salesCloseBeforeEndMinutes = null,
}: EventDateSelectorProps) {
  const locale = useLocale();

  const t = useTranslations("common");
  const te = useTranslations("events");

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
  // date is on sale until it starts, or -- when the organizer keeps selling
  // while it's on -- until its cut-off before the end; the default
  // selection is `nextPurchasable` (a date on now that still sells, else
  // the earliest one still to come), never a past one.
  const onSale = (occ: Occurrence) =>
    isSessionOnSale(occ, salesCloseBeforeEndMinutes, now.getTime());
  const occurrenceState = resolveOccurrenceState(
    undefined,
    undefined,
    sortedEventDates,
    { now: now.getTime(), salesCloseBeforeEndMinutes },
  );
  const nextPurchasable = occurrenceState.nextPurchasable;

  const [selectedStartsAt, setSelectedStartsAt] = useState<string | null>(
    nextPurchasable ? String(nextPurchasable.starts_at) : null,
  );

  // If the tick advanced past the previously-selected date's sales, fall
  // back to the next purchasable one so the CTA never points at a date that
  // can no longer be bought.
  const selectedOccurrence =
    sortedEventDates.find(
      (occ) => String(occ.starts_at) === selectedStartsAt && onSale(occ),
    ) ??
    nextPurchasable ??
    null;

  // The chosen date is on now and still sells: say until when.
  const selectedClosesAt =
    selectedOccurrence &&
    new Date(selectedOccurrence.starts_at).getTime() <= now.getTime()
      ? sessionSalesCloseAt(selectedOccurrence, salesCloseBeforeEndMinutes)
      : null;
  const onNowClock = selectedClosesAt
    ? salesCloseClock(selectedClosesAt, timeZone, locale, now.getTime())
    : null;

  const isCanceled = eventStatus === "canceled";
  const blockedLabel = isCanceled
    ? t("eventCancelled")
    : postponed
      ? t("eventPostponed")
      : occurrenceState.blockReason === "ended"
        ? t("eventEnded")
        : occurrenceState.blockReason === "ongoing_no_future"
          ? t("eventInProgress")
          : null;

  const selectedDateTime = selectedOccurrence
    ? formatFullDateTimeRange(
        selectedOccurrence.starts_at,
        selectedOccurrence.ends_at,
        timeZone,
        locale,
      )
    : null;

  return (
    <div className="flex flex-col gap-3">
      {sortedEventDates.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            {t("dateHeading", { count: sortedEventDates.length })}
          </h3>
          <div className="flex overflow-x-auto gap-3 pb-1">
            {sortedEventDates.map((occurrence, index) => {
              const dateValue = occurrence.starts_at;

              const { day, month, date, time } = getDateParts(
                dateValue,
                timeZone,
                locale,
              );

              // Only a date still on sale is selectable: one still to come,
              // or one on now when the organizer keeps selling while it's
              // on. A finished one obviously can't be.
              const isSelectable = onSale(occurrence);

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

      {!blockedLabel && onNowClock ? (
        <p className="text-sm font-medium text-success">
          {onNowClock.day
            ? te("salesClose.onNowDay", {
                day: onNowClock.day,
                time: onNowClock.time,
              })
            : te("salesClose.onNow", { time: onNowClock.time })}
        </p>
      ) : null}

      {/* Buy ticket / RSVP btn */}
      {blockedLabel ? (
        <button
          type="button"
          disabled
          className="h-12 w-full rounded-lg text-base font-semibold bg-muted text-muted-foreground cursor-not-allowed"
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
              salesCloseBeforeEndMinutes={salesCloseBeforeEndMinutes}
            />
          )
        ) : (
          <CheckoutBtn
            eventId={eventId}
            occurrenceId={selectedOccurrence.id ?? null}
            btnText={t("getTickets")}
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
