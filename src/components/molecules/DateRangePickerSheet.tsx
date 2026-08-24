"use client";

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { MdOutlineDateRange } from "react-icons/md";
import { BottomSheet } from "../atoms/BottomSheet";
import { cn } from "../lib/utils";
import { Calendar } from "../ui/calendar";

type DateRangePickerSheetProps = {
  label?: string;
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  disabledBefore?: Date;
};

const formatShort = (date: Date) =>
  date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

// iPhone-inspired date range picker: a compact trigger that opens a bottom
// sheet (mobile) / small centered panel (desktop) containing a single
// range-mode calendar, with a "Start"/"End" header that highlights whichever
// end of the range the next tap will set -- the same "tap start, tap end"
// convention native mobile date pickers use, instead of two separate month
// grids or a wide desktop-style popover that overflows a small screen.
// Selections are staged in local `draft` state and only committed via
// onChange when "Done" is pressed, so navigating the calendar never mutates
// the applied filter until the user confirms.
export default function DateRangePickerSheet({
  label = "Date range",
  value,
  onChange,
  disabledBefore,
}: DateRangePickerSheetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);

  const openSheet = () => {
    setDraft(value);
    setOpen(true);
  };

  // react-day-picker's range mode sets `from` on the first tap and `to` on
  // the second -- once `from` exists with no `to` yet, the next tap is
  // necessarily choosing the end date.
  const pickingEnd = !!draft?.from && !draft?.to;

  const summary = value?.from
    ? value.to
      ? `${formatShort(value.from)} – ${formatShort(value.to)}`
      : formatShort(value.from)
    : "Any dates";

  return (
    <div className="grid gap-1.5">
      <button
        type="button"
        onClick={openSheet}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2.5 text-sm text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className={cn(!value?.from && "text-muted-foreground")}>
          {summary}
        </span>
        <MdOutlineDateRange className="shrink-0 text-lg text-muted-foreground" />
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(undefined);
                onChange(undefined);
                setOpen(false);
              }}
              className="flex-1 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
              className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        }
      >
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-left transition-colors",
              !pickingEnd
                ? "border-primary bg-primary/10"
                : "border-input bg-background",
            )}
          >
            <p className="text-xs text-muted-foreground">Start</p>
            <p className="text-sm font-medium">
              {draft?.from ? formatShort(draft.from) : "Select"}
            </p>
          </div>
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-left transition-colors",
              pickingEnd
                ? "border-primary bg-primary/10"
                : "border-input bg-background",
            )}
          >
            <p className="text-xs text-muted-foreground">End</p>
            <p className="text-sm font-medium">
              {draft?.to ? formatShort(draft.to) : "Select"}
            </p>
          </div>
        </div>

        <Calendar
          initialFocus
          mode="range"
          defaultMonth={draft?.from ?? new Date()}
          selected={draft}
          onSelect={setDraft}
          numberOfMonths={1}
          disabled={disabledBefore ? { before: disabledBefore } : undefined}
          classNames={{ root: "w-full mx-auto" }}
        />
      </BottomSheet>
    </div>
  );
}
