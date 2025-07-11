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
import React, { useState } from "react";
import type { DateRange } from "react-day-picker";
import { MdOutlineDateRange } from "react-icons/md";
import { TimePicker } from "../atoms/timePicker";
import { Button } from "../ui/button";

type DateAndTimeType = {
  dateType: string;
  handleDateAndTime: (dateAndTime: DateRange | Date[]) => void;
};

type Entry = { date: Date; from: Date; to: Date };

export default function DateTimePicker({
  handleDateAndTime,
  dateType,
}: DateAndTimeType) {
  const [isRangeMode, setIsRangeMode] = useState(false);

  const [dateRange, _setDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined,
  });

  // wrapper to update and notify
  const setDateRange = (r: DateRange) => {
    _setDateRange(r);
    handleDateAndTime(r);
  };

  // specific-mode temps + list
  const [tempDate, setTempDate] = useState<Date | undefined>(new Date());
  const [tempFrom, setTempFrom] = useState<Date | undefined>(new Date());
  const [tempTo, setTempTo] = useState<Date | undefined>(new Date());
  const [entries, setEntries] = useState<Entry[]>([]);

  const addEntry = () => {
    if (!tempDate || !tempFrom || !tempTo) return;
    const next = [...entries, { date: tempDate, from: tempFrom, to: tempTo }];
    setEntries(next);
    handleDateAndTime(next.map((e) => e.date));
    setTempDate(undefined);
    setTempFrom(undefined);
    setTempTo(undefined);
  };

  const removeAt = (idx: number) => {
    const next = entries.filter((_, i) => i !== idx);
    setEntries(next);
    handleDateAndTime(next.map((e) => e.date));
  };

  return (
    <>
      <Popover>
        <PopoverTrigger className="flex w-full justify-between items-center md:px-0 md:text-sm">
          <p className="text-sm font-bold text-gray-600">
            Click to set date & time
          </p>

          <MdOutlineDateRange className="text-2xl" />
        </PopoverTrigger>

        <PopoverContent className="space-y-4">
          {dateType === "single" ? (
            <>
              {/* Toggle for Single/Range */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="rangeMode"
                  checked={isRangeMode}
                  onChange={(e) => setIsRangeMode(e.target.checked)}
                />
                <label htmlFor="rangeMode" className="text-sm">
                  Use Date Range
                </label>
              </div>

              {/* Calendar */}
              {isRangeMode ? (
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.from ?? new Date()}
                  selected={dateRange}
                  onSelect={(d) => setDateRange(d as DateRange)}
                  numberOfMonths={1}
                  disabled={{ before: new Date() }}
                />
              ) : (
                <Calendar
                  initialFocus
                  mode="single"
                  defaultMonth={dateRange.from ?? new Date()}
                  selected={dateRange.from}
                  onSelect={(d) => {
                    if (d instanceof Date) {
                      setDateRange({
                        from: d,
                        to: new Date(d.getTime() + 60 * 60 * 1000),
                      });
                    }
                  }}
                  numberOfMonths={1}
                  disabled={{ before: new Date() }}
                />
              )}

              {/* Time Pickers */}
              <div className="flex items-end justify-between mt-4">
                <TimePicker
                  date={dateRange.from}
                  setDate={(d) =>
                    d && setDateRange({ from: d, to: dateRange.to })
                  }
                />
                <span className="mx-2">—</span>
                <TimePicker
                  date={dateRange.to}
                  setDate={(d) =>
                    d && setDateRange({ from: dateRange.from, to: d })
                  }
                />
                <div className="flex items-center ml-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                </div>
              </div>
            </>
          ) : (
            <>
              <Calendar
                initialFocus
                mode="single"
                defaultMonth={tempDate ?? new Date()}
                selected={tempDate}
                onSelect={(d) => setTempDate(d as Date)}
                numberOfMonths={1}
              />
              <div className="flex items-end justify-between mt-4">
                <TimePicker
                  date={tempFrom}
                  setDate={(d) => d && setTempFrom(d)}
                />
                <span className="mx-2">—</span>
                <TimePicker date={tempTo} setDate={(d) => d && setTempTo(d)} />
                <div className="flex items-center ml-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                </div>
              </div>
              <Button
                className="mt-4 w-full"
                onClick={addEntry}
                disabled={!tempDate || !tempFrom || !tempTo}
              >
                Add date
              </Button>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* single display */}
      {/* {dateType === "single" && dateRange.from && (
        <p className="mt-3 text-sm text-gray-700">
          {formatFullDateTimeRange(dateRange.from, dateRange.to).date},{" "}
          {formatFullDateTimeRange(dateRange.from, dateRange.to).time}
        </p>
      )} */}

      {dateType === "single" && dateRange.from && dateRange.to && (
        <p className="mt-3 text-sm text-gray-700">
          {formatFullDateTimeRange(dateRange.from, dateRange.to).date},{" "}
          {formatFullDateTimeRange(dateRange.from, dateRange.to).time}
        </p>
      )}

      {/* specific list */}
      {dateType === "specific" && entries.length > 0 && (
        <ul className="mt-4 space-y-2">
          {entries.map((e, i) => {
            const { date: ds } = formatSingleDateTime(e.date);
            const time = `${e.from.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })} - ${e.to.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })}`;
            return (
              <li
                key={e.date.toISOString()}
                className="flex justify-between items-center bg-gray-100 rounded px-3 py-2"
              >
                <div>
                  <p className="text-sm">{ds}</p>
                  <p className="text-xs text-gray-600">{time}</p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => removeAt(i)}
                >
                  Delete
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
