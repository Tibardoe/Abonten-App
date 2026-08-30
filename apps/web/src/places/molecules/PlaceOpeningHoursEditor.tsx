"use client";

import { TimeInput } from "@/components/atoms/TimeInput";
import { DISPLAY_DAYS } from "@/utils/dayOfWeek";
import type { PlaceOpeningHoursInput } from "@abonten/types/placeType";

type PlaceOpeningHoursEditorProps = {
  openingHours: PlaceOpeningHoursInput[];
  onChange: (hours: PlaceOpeningHoursInput[]) => void;
};

// Supports exactly one open/close range per day; the underlying data model
// (and create_place) already supports more than one range per day, but a
// richer multi-range editor belongs on the Place management page (Milestone
// 6), not this shorter creation flow.

export default function PlaceOpeningHoursEditor({
  openingHours,
  onChange,
}: PlaceOpeningHoursEditorProps) {
  const updateDay = (
    dayOfWeek: number,
    patch: Partial<PlaceOpeningHoursInput>,
  ) => {
    onChange(
      openingHours.map((hour) =>
        hour.dayOfWeek === dayOfWeek ? { ...hour, ...patch } : hour,
      ),
    );
  };

  const copyMondayToAll = () => {
    const monday = openingHours.find((hour) => hour.dayOfWeek === 1);
    if (!monday) return;

    onChange(
      openingHours.map((hour) =>
        hour.dayOfWeek === 1
          ? hour
          : {
              ...hour,
              openTime: monday.openTime,
              closeTime: monday.closeTime,
              isClosed: monday.isClosed,
            },
      ),
    );
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={copyMondayToAll}
        className="text-sm text-primary hover:underline"
      >
        Copy Monday's hours to all days
      </button>

      <div className="space-y-2">
        {DISPLAY_DAYS.map(({ dayOfWeek, label }) => {
          const hour = openingHours.find((h) => h.dayOfWeek === dayOfWeek);
          if (!hour) return null;

          return (
            <div
              key={dayOfWeek}
              className="flex flex-wrap items-center gap-3 overflow-x-hidden py-2 border-b border-border text-sm"
            >
              <span className="w-24 font-medium text-foreground">{label}</span>

              <label className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                <input
                  type="checkbox"
                  checked={hour.isClosed}
                  onChange={(event) =>
                    updateDay(dayOfWeek, { isClosed: event.target.checked })
                  }
                  className="h-4 w-4 accent-primary"
                />
                Closed
              </label>

              {!hour.isClosed && (
                <div className="flex items-center gap-2 text-foreground">
                  <TimeInput
                    aria-label={`${label} opening time`}
                    value={hour.openTime ?? ""}
                    onChange={(value) =>
                      updateDay(dayOfWeek, { openTime: value })
                    }
                    className="w-auto"
                  />
                  <span className="text-muted-foreground">to</span>
                  <TimeInput
                    aria-label={`${label} closing time`}
                    value={hour.closeTime ?? ""}
                    onChange={(value) =>
                      updateDay(dayOfWeek, { closeTime: value })
                    }
                    className="w-auto"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
