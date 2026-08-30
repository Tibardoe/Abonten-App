"use client";

import { useState } from "react";
import { MdOutlineDateRange } from "react-icons/md";
import { cn } from "../lib/utils";
import { Calendar } from "../ui/calendar";
import { BottomSheet } from "./BottomSheet";

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

// Single-date picker used by the event date editor, ticket sale window, and
// promo-code expiry date. Opens the same iPhone-inspired bottom sheet (mobile)
// / small centered panel (desktop) as the filter's date-range picker, so the
// app has one date-selection interaction instead of several -- a plain
// button trigger reveals a large-touch-target Calendar with a clear "Done"
// action, rather than a fixed-width popover that can overflow a narrow
// viewport or an always-expanded inline calendar that eats vertical space.
export function InlineDateField({
  label,
  date,
  onSelect,
  disabledBefore,
  formatDate = defaultFormat,
}: InlineDateFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date | undefined>(date);

  const openSheet = () => {
    setDraft(date);
    setOpen(true);
  };

  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={openSheet}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className={cn(!date && "text-muted-foreground")}>
          {date ? formatDate(date) : "Select date"}
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
              onClick={() => setOpen(false)}
              className="flex-1 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft}
              onClick={() => {
                if (draft) onSelect(draft);
                setOpen(false);
              }}
              className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              Done
            </button>
          </div>
        }
      >
        <Calendar
          initialFocus
          mode="single"
          defaultMonth={draft ?? new Date()}
          selected={draft}
          onSelect={(d) => {
            if (d instanceof Date) setDraft(d);
          }}
          numberOfMonths={1}
          disabled={disabledBefore ? { before: disabledBefore } : undefined}
          classNames={{ root: "w-full mx-auto" }}
        />
      </BottomSheet>
    </div>
  );
}
