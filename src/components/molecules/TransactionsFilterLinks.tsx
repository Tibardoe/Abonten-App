"use client";

import { formatSingleDateTime } from "@/utils/dateFormatter";
import Link from "next/link";
import React from "react";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export default function TransactionsFilterLinks() {
  const [date, setDate] = React.useState<Date | undefined>(new Date());

  const dateAndTime = date ? formatSingleDateTime(date) : { date: "" };

  const today = new Date();
  const toISOStringDate = (d: Date) => d.toISOString().split("T")[0];

  const formattedDateStr = date ? toISOStringDate(date) : "";

  const todayStr = toISOStringDate(today);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = toISOStringDate(yesterday);

  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);
  const lastWeekStr = toISOStringDate(lastWeek);

  const lastMonth = new Date(today);
  lastMonth.setDate(today.getDate() - 30);
  const lastMonthStr = toISOStringDate(lastMonth);

  return (
    <div className="flex justify-between items-center overflow-x-scroll md:overflow-x-hidden gap-5 md:gap-0">
      <Link className="shrink-0" href="/transactions">
        All Time
      </Link>

      <Link className="shrink-0" href={`/transactions/date/${todayStr}`}>
        Today
      </Link>

      <Link className="shrink-0" href={`/transactions/date/${yesterdayStr}`}>
        Yesterday
      </Link>

      <Link className="shrink-0" href={`/transactions/date/${lastWeekStr}`}>
        Last Week
      </Link>

      <Link className="shrink-0" href={`/transactions/date/${lastMonthStr}`}>
        Last Month
      </Link>

      <Popover>
        <PopoverTrigger>Custom</PopoverTrigger>
        <PopoverContent className="space-y-4">
          <Calendar
            initialFocus
            mode="single"
            selected={date}
            onSelect={setDate}
          />

          <Link
            href={`/transactions/date/${formattedDateStr}`}
            className="bg-black p-2 px-4 rounded-md text-white"
          >
            Set
          </Link>
        </PopoverContent>
      </Popover>
    </div>
  );
}
