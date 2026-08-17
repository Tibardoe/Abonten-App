"use client";

import { useState } from "react";
import { MdOutlineDateRange } from "react-icons/md";
import { cn } from "../lib/utils";
import { Calendar } from "../ui/calendar";

type InlineDateFieldProps = {
  label: string;
  date: Date | undefined;
  onSelect: (date: Date) => void;
  disabledBefore?: Date;
  formatDate?: (date: Date) => string;
};

const defaultFormat = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

// Replaces a date popover with an inline, collapsible calendar -- click the
// trigger to reveal the (unchanged) Calendar component directly beneath it
// in the normal page flow, instead of a fixed-width popup that overflows on
// small viewports. Shared by the event date editor and the promo-code
// expiry date so both get the same interaction.
export function InlineDateField({
  label,
  date,
  onSelect,
  disabledBefore,
  formatDate = defaultFormat,
}: InlineDateFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className={cn(!date && "text-muted-foreground")}>
          {date ? formatDate(date) : "Select date"}
        </span>
        <MdOutlineDateRange className="shrink-0 text-lg text-muted-foreground" />
      </button>

      {open && (
        <div className="rounded-md border border-input p-2 overflow-x-auto">
          <Calendar
            initialFocus
            mode="single"
            defaultMonth={date ?? new Date()}
            selected={date}
            onSelect={(d) => {
              if (d instanceof Date) {
                onSelect(d);
                setOpen(false);
              }
            }}
            numberOfMonths={1}
            disabled={disabledBefore ? { before: disabledBefore } : undefined}
            // Fills its container up to a comfortable size rather than
            // stretching edge-to-edge -- unbounded full width spaced the day
            // numbers out too far once the container got wide.
            classNames={{ root: "w-full" }}
          />
        </div>
      )}
    </div>
  );
}
