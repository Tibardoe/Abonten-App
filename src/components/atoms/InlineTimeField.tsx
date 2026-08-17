"use client";

import { useState } from "react";
import { TimePicker } from "./timePicker";

type InlineTimeFieldProps = {
  label: string;
  date: Date | undefined;
  onChange: (date: Date) => void;
  use12Hour: boolean;
  // Called once, the moment the organizer clicks "Select time" -- provides
  // the starting value the picker seeds with. Never invoked until the
  // organizer explicitly opts in, so a field they haven't touched never
  // silently reports midnight.
  seedValue: () => Date;
};

// Starts as a plain "Select time" trigger with no time shown at all --
// TimePickerInput's own fallback (00:00 when its date prop is undefined)
// was what made an untouched field look like it was already set to
// 12:00 AM. Revealing the actual picker only after an explicit click keeps
// that fallback from ever being visible to the organizer.
export function InlineTimeField({
  label,
  date,
  onChange,
  use12Hour,
  seedValue,
}: InlineTimeFieldProps) {
  const [revealed, setRevealed] = useState(!!date);

  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {revealed ? (
        <TimePicker
          date={date}
          setDate={(d) => d && onChange(d)}
          use12Hour={use12Hour}
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
