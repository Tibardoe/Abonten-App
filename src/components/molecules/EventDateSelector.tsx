"use client";

import type { Occurrence } from "@/types/occurrenceType";
import { formatFullDateTimeRange, getDateParts } from "@/utils/dateFormatter";
import React, { useState } from "react";
import CheckoutBtn from "../atoms/CheckoutBtn";
import DateBtn from "../atoms/DateBtn";

type EventDateSelectorProps = {
  eventDates: Occurrence[];
  eventId: string;
  eventTitle: string;
  minTicket: {
    id: string;
    type: string;
    price: number;
    currency: string;
  } | null;
  time: string;
  requireRegistration?: boolean;
};

export default function EventDateSelector({
  eventDates,
  eventId,
  minTicket,
  eventTitle,
  time,
  requireRegistration,
}: EventDateSelectorProps) {
  const now = new Date();

  const firstFutureOccurrence =
    eventDates.find((occ) => new Date(occ.ends_at) >= now) ?? null;

  const [selectedOccurrence, setSelectedOccurrence] =
    useState<Occurrence | null>(firstFutureOccurrence);

  const selectedDateTime = selectedOccurrence
    ? formatFullDateTimeRange(
        selectedOccurrence.starts_at,
        selectedOccurrence.ends_at,
      )
    : null;

  return (
    <div className="flex flex-col gap-3">
      {eventDates.length > 0 && (
        <div className="mb-3 p-2">
          <h2 className="font-bold mb-2">Dates</h2>
          <div className="flex overflow-x-auto gap-3">
            {eventDates.map((occurrence) => {
              const dateValue = occurrence.starts_at;

              const { day, month, date, time } = getDateParts(dateValue);

              const isPast = new Date(occurrence.ends_at) < new Date();

              const isActive =
                !isPast && selectedOccurrence?.starts_at === dateValue;

              return (
                <DateBtn
                  key={occurrence.id}
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

      {/* Buy ticket btn */}
      {selectedDateTime && (
        <CheckoutBtn
          eventId={eventId}
          btnText={
            minTicket?.price === 0 || minTicket === null
              ? "Register"
              : "Buy Ticket"
          }
          eventTitle={eventTitle}
          date={selectedDateTime.date}
          time={selectedDateTime.time}
          requireRegistration={requireRegistration}
        />
      )}
    </div>
  );
}
