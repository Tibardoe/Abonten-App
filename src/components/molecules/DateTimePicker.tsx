"use client";

import {
  formatFullDateTimeRange,
  formatSingleDateTime,
} from "@/utils/dateFormatter";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { InlineDateField } from "../atoms/InlineDateField";
import { InlineTimeField } from "../atoms/InlineTimeField";
import { Button } from "../ui/button";

type DateAndTimeType = {
  dateType: string;
  handleDateAndTime: (dateAndTime: DateRange | Entry[]) => void;
  // Prefills the picker with an event's existing schedule (edit flow only —
  // the create flow doesn't pass these, so it keeps starting empty).
  initialRange?: DateRange;
  initialEntries?: Entry[];
};

type Entry = { start: Date; end: Date };

function combineDateAndTime(day: Date, time: Date): Date {
  const combined = new Date(day);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined;
}

// Seeds the start-time field to the next upcoming half hour rather than a
// fixed value, so it always feels like a plausible starting point instead
// of an arbitrary default.
function nextHalfHour(): Date {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (date.getMinutes() === 0) date.setHours(date.getHours() + 1);
  return date;
}

const timeLabel = (date: Date, use12Hour: boolean) =>
  date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: use12Hour,
  });

export default function DateTimePicker({
  handleDateAndTime,
  dateType,
  initialRange,
  initialEntries,
}: DateAndTimeType) {
  const [use12Hour, setUse12Hour] = useState(true);
  const [isRangeMode, setIsRangeMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Committed values -- what's actually been added, shown in the summary
  // list/line and reported to the parent form.
  const [dateRange, setDateRangeState] = useState<DateRange>(
    initialRange ?? { from: undefined, to: undefined },
  );
  const [entries, setEntries] = useState<Entry[]>(initialEntries ?? []);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const commitSingle = (range: DateRange) => {
    setDateRangeState(range);
    handleDateAndTime(range);
  };

  // Draft state for whichever editor session is currently open -- reset to
  // fully empty every time the editor is (re)opened via the `key` prop on
  // <EditorFields>, so a fresh "Add" never shows a stale or pre-filled value.

  return (
    <div className="space-y-3">
      {/* Single-mode summary */}
      {dateType === "single" &&
        dateRange.from &&
        dateRange.to &&
        !editorOpen && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3 py-2">
            <div>
              <p className="text-sm">
                {formatFullDateTimeRange(dateRange.from, dateRange.to).date}
              </p>
              <p className="text-xs text-muted-foreground">
                {timeLabel(dateRange.from, use12Hour)} –{" "}
                {timeLabel(dateRange.to, use12Hour)}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditorOpen(true)}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => commitSingle({ from: undefined, to: undefined })}
              >
                Delete
              </Button>
            </div>
          </div>
        )}

      {/* Specific-mode summary list */}
      {dateType === "specific" && entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((entry, i) => (
            <li
              key={entry.start.toISOString()}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3 py-2"
            >
              <div>
                <p className="text-sm">
                  {formatSingleDateTime(entry.start).date}
                </p>
                <p className="text-xs text-muted-foreground">
                  {timeLabel(entry.start, use12Hour)} –{" "}
                  {timeLabel(entry.end, use12Hour)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingIndex(i);
                    setEditorOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    const next = entries.filter((_, idx) => idx !== i);
                    setEntries(next);
                    handleDateAndTime(next);
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Trigger -- single mode only needs this before its one entry exists;
          once it does, the summary row above already has its own Edit
          button, so showing this too would be a redundant second "Edit". */}
      {!editorOpen &&
        (dateType === "single" ? !(dateRange.from && dateRange.to) : true) && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setEditingIndex(null);
              setEditorOpen(true);
            }}
          >
            {dateType === "specific" && entries.length > 0
              ? "+ Add another date"
              : "+ Add date and time"}
          </Button>
        )}

      {/* Inline editor */}
      {editorOpen && (
        <EditorFields
          key={dateType === "specific" ? (editingIndex ?? "new") : "single"}
          dateType={dateType}
          isRangeMode={isRangeMode}
          setIsRangeMode={setIsRangeMode}
          use12Hour={use12Hour}
          setUse12Hour={setUse12Hour}
          initial={
            dateType === "single"
              ? dateRange.from && dateRange.to
                ? { from: dateRange.from, to: dateRange.to }
                : undefined
              : editingIndex !== null
                ? entries[editingIndex]
                  ? {
                      from: entries[editingIndex].start,
                      to: entries[editingIndex].end,
                    }
                  : undefined
                : undefined
          }
          error={error}
          setError={setError}
          submitLabel={
            dateType === "single"
              ? dateRange.from
                ? "Save changes"
                : "Add date"
              : editingIndex !== null
                ? "Save changes"
                : "Add date"
          }
          onCancel={() => {
            setEditorOpen(false);
            setEditingIndex(null);
            setError(null);
          }}
          onSubmit={(range) => {
            if (dateType === "single") {
              commitSingle(range);
            } else if (range.from && range.to) {
              const candidate: Entry = { start: range.from, end: range.to };

              const isDuplicate = entries.some(
                (e, idx) =>
                  idx !== editingIndex &&
                  e.start.getTime() === candidate.start.getTime() &&
                  e.end.getTime() === candidate.end.getTime(),
              );
              if (isDuplicate) {
                setError("This date and time has already been added.");
                return;
              }

              const next =
                editingIndex !== null
                  ? entries.map((e, idx) =>
                      idx === editingIndex ? candidate : e,
                    )
                  : [...entries, candidate];
              setEntries(next);
              handleDateAndTime(next);
            }
            setEditorOpen(false);
            setEditingIndex(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

type EditorFieldsProps = {
  dateType: string;
  isRangeMode: boolean;
  setIsRangeMode: (v: boolean) => void;
  use12Hour: boolean;
  setUse12Hour: (v: boolean) => void;
  initial?: { from: Date; to: Date };
  error: string | null;
  setError: (e: string | null) => void;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (range: DateRange) => void;
};

// Isolated in its own component (mounted fresh via the `key` prop on every
// open) so draft state never leaks between "add" and "edit" sessions, or
// between edits of two different entries.
function EditorFields({
  dateType,
  isRangeMode,
  setIsRangeMode,
  use12Hour,
  setUse12Hour,
  initial,
  error,
  setError,
  submitLabel,
  onCancel,
  onSubmit,
}: EditorFieldsProps) {
  const [day, setDay] = useState<Date | undefined>(initial?.from);
  const [rangeDays, setRangeDays] = useState<DateRange>({
    from: initial?.from,
    to: initial?.to,
  });
  const [fromTime, setFromTime] = useState<Date | undefined>(initial?.from);
  const [toTime, setToTime] = useState<Date | undefined>(initial?.to);

  const handleSubmit = () => {
    setError(null);

    const startDay =
      dateType === "single" && isRangeMode ? rangeDays.from : day;
    const endDay = dateType === "single" && isRangeMode ? rangeDays.to : day;

    if (!startDay || !endDay || !fromTime || !toTime) {
      setError("Please select a date, start time, and end time.");
      return;
    }

    const start = combineDateAndTime(startDay, fromTime);
    const end = combineDateAndTime(endDay, toTime);

    if (end <= start) {
      setError("End time must be after start time.");
      return;
    }

    onSubmit({ from: start, to: end });
  };

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      {dateType === "single" && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="rangeMode"
            checked={isRangeMode}
            onChange={(e) => setIsRangeMode(e.target.checked)}
          />
          <label htmlFor="rangeMode" className="text-sm">
            Use date range (event spans multiple days)
          </label>
        </div>
      )}

      {dateType === "single" && isRangeMode ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <InlineDateField
            label="Start date"
            date={rangeDays.from}
            onSelect={(d) => setRangeDays((r) => ({ ...r, from: d }))}
            disabledBefore={new Date()}
          />
          <InlineDateField
            label="End date"
            date={rangeDays.to}
            onSelect={(d) => setRangeDays((r) => ({ ...r, to: d }))}
            disabledBefore={rangeDays.from ?? new Date()}
          />
        </div>
      ) : (
        <InlineDateField
          label="Date"
          date={day}
          onSelect={setDay}
          disabledBefore={new Date()}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <InlineTimeField
          label="Start time"
          date={fromTime}
          onChange={setFromTime}
          use12Hour={use12Hour}
          seedValue={nextHalfHour}
        />
        <InlineTimeField
          label="End time"
          date={toTime}
          onChange={setToTime}
          use12Hour={use12Hour}
          seedValue={() =>
            fromTime
              ? new Date(fromTime.getTime() + 60 * 60 * 1000)
              : new Date(nextHalfHour().getTime() + 60 * 60 * 1000)
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Time format</span>
        <div className="flex rounded-md border border-input overflow-hidden text-xs">
          {(
            [
              { value: true, label: "12-hour" },
              { value: false, label: "24-hour" },
            ] as const
          ).map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={use12Hour === option.value}
              onClick={() => setUse12Hour(option.value)}
              className={`px-2 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                use12Hour === option.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="button" className="w-full" onClick={handleSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
