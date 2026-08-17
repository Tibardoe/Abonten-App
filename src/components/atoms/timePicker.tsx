"use client";

import { Label } from "@/components/ui/label";
// import { Clock } from "lucide-react";
import * as React from "react";
import { TimePeriodSelect } from "./time-period-select";
import { TimePickerInput } from "./time-picker-input";
import { set12Hours } from "./time-picker-utils";

interface TimePickerProps {
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
  // Presentation only -- the same underlying Date is edited either way
  // (date.getHours()/setHours()), so toggling this never changes what
  // gets submitted or stored.
  use12Hour?: boolean;
}

export function TimePicker({
  date,
  setDate,
  use12Hour = false,
}: TimePickerProps) {
  const minuteRef = React.useRef<HTMLInputElement>(null);
  const hourRef = React.useRef<HTMLInputElement>(null);
  const secondRef = React.useRef<HTMLInputElement>(null);

  const period = date && date.getHours() >= 12 ? "PM" : "AM";

  const handlePeriodChange = (newPeriod: "AM" | "PM") => {
    if (!date) return;
    const currentHour = date.getHours() % 12 || 12;
    setDate(set12Hours(new Date(date), String(currentHour), newPeriod));
  };

  return (
    <div className="flex items-end gap-2">
      <div className="grid gap-1 text-center">
        <Label htmlFor="hours" className="text-xs">
          Hours
        </Label>
        <TimePickerInput
          picker={use12Hour ? "12hours" : "hours"}
          period={use12Hour ? period : undefined}
          date={date}
          setDate={setDate}
          ref={hourRef}
          onRightFocus={() => minuteRef.current?.focus()}
        />
      </div>
      <div className="grid gap-1 text-center">
        <Label htmlFor="minutes" className="text-xs">
          Minutes
        </Label>
        <TimePickerInput
          picker="minutes"
          date={date}
          setDate={setDate}
          ref={minuteRef}
          onLeftFocus={() => hourRef.current?.focus()}
          onRightFocus={() => secondRef.current?.focus()}
        />
      </div>
      {use12Hour && (
        <div className="grid gap-1 text-center">
          <Label className="text-xs">Period</Label>
          <TimePeriodSelect period={period} setPeriod={handlePeriodChange} />
        </div>
      )}
      {/* <div className="grid gap-1 text-center">
        <Label htmlFor="seconds" className="text-xs">
          Seconds
        </Label>
        <TimePickerInput
          picker="seconds"
          date={date}
          setDate={setDate}
          ref={secondRef}
          onLeftFocus={() => minuteRef.current?.focus()}
        />
      </div> */}
      {/* <div className="flex h-10 items-center">
        <Clock className="ml-2 h-4 w-4" />
      </div> */}
    </div>
  );
}
