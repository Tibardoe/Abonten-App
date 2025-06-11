"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export default function TransactionsFilterLinks() {
  const pathname = usePathname();

  const [date, setDate] = React.useState<Date | undefined>(new Date());

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

  const isActive = (href: string) => pathname === href;

  const baseLinkClass = "shrink-0";
  const getLinkClass = (href: string) =>
    `${baseLinkClass} ${
      isActive(href) ? "font-bold text-black" : "text-gray-500"
    }`;

  return (
    <div className="flex justify-between items-center overflow-x-scroll md:overflow-x-hidden gap-5 md:gap-0">
      <Link className={getLinkClass("/transactions")} href="/transactions">
        All Time
      </Link>

      <Link
        className={getLinkClass(`/transactions/date/${todayStr}`)}
        href={`/transactions/date/${todayStr}`}
      >
        Today
      </Link>

      <Link
        className={getLinkClass(`/transactions/date/${yesterdayStr}`)}
        href={`/transactions/date/${yesterdayStr}`}
      >
        Yesterday
      </Link>

      <Link
        className={getLinkClass(`/transactions/date/${lastWeekStr}`)}
        href={`/transactions/date/${lastWeekStr}`}
      >
        Last Week
      </Link>

      <Link
        className={getLinkClass(`/transactions/date/${lastMonthStr}`)}
        href={`/transactions/date/${lastMonthStr}`}
      >
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
