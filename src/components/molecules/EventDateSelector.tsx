"use client";

import { formatSingleDateTime, getDateParts } from "@/utils/dateFormatter";
import React, { useState } from "react";
import CheckoutBtn from "../atoms/CheckoutBtn";
import DateBtn from "../atoms/DateBtn";

type EventDateSelectorProps = {
  eventDates: string[];
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
  const [selectedDate, setSelectedDate] = useState(eventDates[0]);

  return (
    <div className="flex flex-col gap-3">
      {eventDates.length > 0 && (
        <div className="mb-3 p-2">
          <h2 className="font-bold mb-2">Dates</h2>
          <div className="flex overflow-x-auto gap-3">
            {eventDates.map((dateString: string) => {
              const { day, month, date, time } = getDateParts(dateString);

              const isActive = selectedDate === dateString;

              return (
                <DateBtn
                  dateString={dateString}
                  onClick={() => setSelectedDate(dateString)}
                  key={dateString}
                  day={day}
                  month={month}
                  date={date}
                  isActive={isActive}
                  time={time}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Buy ticket btn */}
      <CheckoutBtn
        eventId={eventId}
        btnText={
          minTicket?.price === 0 || minTicket === null
            ? "Register"
            : "Buy Ticket"
        }
        eventTitle={eventTitle}
        date={formatSingleDateTime(selectedDate).date}
        time={time}
        requireRegistration={requireRegistration}
      />
    </div>
  );
}
