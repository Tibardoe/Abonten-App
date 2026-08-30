"use client";

import { useState } from "react";
import { TimeInput } from "./TimeInput";

type InlineTimeFieldProps = {
  label: string;
  date: Date | undefined;
  onChange: (date: Date) => void;
  // Called once, the moment the organizer clicks "Select time" -- provides
  // the starting value the picker seeds with. Never invoked until the
  // organizer explicitly opts in, so a field they haven't touched never
  // silently reports midnight.
  seedValue: () => Date;
};

const toTimeValue = (date: Date | undefined): string => {
  if (!date) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

// Starts as a plain "Select time" trigger with no time shown at all --
// a native time input's own fallback (00:00 when its value is empty) was
// what made an untouched field look like it was already set to 12:00 AM.
// Revealing the actual input only after an explicit click keeps that
// fallback from ever being visible to the organizer. Backed by the same
// native <input type="time"> used for Place opening hours (see TimeInput),
// so event and place time entry share one interaction and one styling
// source of truth instead of two divergent time pickers.
export function InlineTimeField({
  label,
  date,
  onChange,
  seedValue,
}: InlineTimeFieldProps) {
  const [revealed, setRevealed] = useState(!!date);

  const handleTimeChange = (value: string) => {
    const [hoursStr, minutesStr] = value.split(":");
    const hours = Number(hoursStr);
    const minutes = Number(minutesStr);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return;

    const base = date ?? seedValue();
    const next = new Date(base);
    next.setHours(hours, minutes, 0, 0);
    onChange(next);
  };

  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground" id={`${label}-label`}>
        {label}
      </span>
      {revealed ? (
        <TimeInput
          aria-label={label}
          value={toTimeValue(date)}
          onChange={handleTimeChange}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            onChange(seedValue());
            setRevealed(true);
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-left text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Select time
        </button>
      )}
    </div>
  );
}
