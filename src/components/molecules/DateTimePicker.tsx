"use client";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatFullDateTimeRange,
  formatSingleDateTime,
} from "@/utils/dateFormatter";
import { Clock } from "lucide-react";
import Image from "next/image";
import React, { useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { MdOutlineDateRange } from "react-icons/md";
import { TimePicker } from "../atoms/timePicker";

type DateAndTimeType = { handleDateAndTime: (dateAndTime: DateRange) => void };

export default function DateTimePicker({ handleDateAndTime }: DateAndTimeType) {
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });

  useEffect(() => {
    if (date?.from || date?.to) {
      handleDateAndTime(date);
    }
  }, [date, handleDateAndTime]);

  const dateTime = formatFullDateTimeRange(date?.from, date?.to);

  return (
    <Popover>
      <PopoverTrigger className="flex w-full justify-between items-center md:px-0 md:text-sm">
        <span>
          {dateTime.date}, {dateTime.time}
        </span>

        <MdOutlineDateRange className="text-2xl" />
      </PopoverTrigger>
      <PopoverContent className="space-y-4">
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={date?.from}
          selected={date}
          onSelect={setDate}
          numberOfMonths={1}
        />

        <div className="flex justify-between items-end w-full">
          <TimePicker
            date={date?.from}
            setDate={(newDate) => {
              setDate((prev) => ({
                from: newDate,
                to: prev?.to ?? newDate, // fallback to newDate if `to` is undefined
              }));
            }}
          />

          <span className="self-center">--</span>

          <TimePicker
            date={date?.to}
            setDate={(newDate) =>
              setDate((prev) => ({
                from: prev?.from ?? newDate, // fallback to newDate if `from` is undefined
                to: newDate,
              }))
            }
          />

          <div className="flex h-10 items-center">
            <Clock className="ml-2 h-4 w-4" />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
