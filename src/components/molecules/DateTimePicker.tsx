"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateWithSuffix } from "@/utils/dateFormatter";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDays } from "date-fns";
import { Clock } from "lucide-react";
import Image from "next/image";
import React from "react";
import type { DateRange } from "react-day-picker";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TimePicker } from "../atoms/timePicker";

type DateAndTimeType = { handleDateAndTime: (dateAndTime: DateRange) => void };

export default function DateTimePicker({ handleDateAndTime }: DateAndTimeType) {
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });

  const handleDate = () => {
    if (date) {
      setDate(date);
      handleDateAndTime(date);
    }
  };

  return (
    <Popover>
      <PopoverTrigger className="flex w-full justify-between items-center md:px-0 md:text-sm">
        <span>
          {date?.from && date?.to
            ? `${formatDateWithSuffix(date?.from)} - ${formatDateWithSuffix(
                date?.to,
              )}`
            : "Date and Time"}

          {date?.from && !date?.to && `${formatDateWithSuffix(date?.from)}`}

          {date?.to && !date?.from && `${formatDateWithSuffix(date?.to)}`}
        </span>
        <Image
          src="/assets/images/date.svg"
          alt="Date"
          height={20}
          width={20}
        />
      </PopoverTrigger>
      <PopoverContent className="space-y-4">
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={date?.from}
          selected={date}
          onSelect={handleDate}
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
