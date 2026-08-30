"use client";

import { setPlaceTemporaryStatus } from "@/actions/setPlaceTemporaryStatus";
import { updatePlaceOpeningHours } from "@/actions/updatePlaceOpeningHours";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useToast } from "@/hooks/useToast";
import PlaceOpeningHoursEditor from "@/places/molecules/PlaceOpeningHoursEditor";
import type { PlaceOpeningHoursInput } from "@abonten/types/placeType";
import { useState } from "react";

type TemporaryStatus = "temporarily_closed" | "permanently_closed" | null;

type DbOpeningHourRow = {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
};

type ManagePlaceHoursSectionProps = {
  placeId: string;
  openingHours: DbOpeningHourRow[];
  temporaryStatus: TemporaryStatus;
  temporaryStatusNote: string | null;
  onChanged: () => void;
};

function toInputRows(rows: DbOpeningHourRow[]): PlaceOpeningHoursInput[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const existing = rows.find((row) => row.day_of_week === dayOfWeek);
    return {
      dayOfWeek,
      openTime: existing?.open_time?.slice(0, 5) ?? "09:00",
      closeTime: existing?.close_time?.slice(0, 5) ?? "17:00",
      isClosed: existing?.is_closed ?? true,
    };
  });
}

const STATUS_OPTIONS: { value: TemporaryStatus; label: string }[] = [
  { value: null, label: "Normal hours" },
  { value: "temporarily_closed", label: "Temporarily closed" },
  { value: "permanently_closed", label: "Permanently closed" },
];

// Weekly hours editor (reusing PlaceOpeningHoursEditor.tsx as-is, per the
// milestone spec) plus the "Temporarily closed / Permanently closed /
// Normal hours" status control. Selecting either closed status is
// destructive enough (it hides the place from "open now" searches
// immediately) to warrant the same ConfirmDeleteModal confirmation pattern
// used elsewhere for destructive actions.
export default function ManagePlaceHoursSection({
  placeId,
  openingHours,
  temporaryStatus,
  temporaryStatusNote,
  onChanged,
}: ManagePlaceHoursSectionProps) {
  const toast = useToast();

  const [hours, setHours] = useState<PlaceOpeningHoursInput[]>(
    toInputRows(openingHours),
  );
  const [isSavingHours, setIsSavingHours] = useState(false);

  const [currentStatus, setCurrentStatus] = useState(temporaryStatus);
  const [note, setNote] = useState(temporaryStatusNote ?? "");
  const [pendingStatus, setPendingStatus] = useState<
    TemporaryStatus | undefined
  >(undefined);
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  const saveHours = async () => {
    const hasIncompleteHours = hours.some(
      (hour) => !hour.isClosed && (!hour.openTime || !hour.closeTime),
    );
    if (hasIncompleteHours) {
      toast.error("Please set open and close times for every open day.");
      return;
    }

    setIsSavingHours(true);
    try {
      const response = await updatePlaceOpeningHours(placeId, hours);
      if (response.status === 200) {
        toast.success("Hours updated successfully.");
        onChanged();
      } else {
        toast.error(response.message ?? "We couldn't update your hours.");
      }
    } finally {
      setIsSavingHours(false);
    }
  };

  const requestStatusChange = (status: TemporaryStatus) => {
    if (status === currentStatus) return;
    // Switching back to "Normal hours" is non-destructive (it just re-opens
    // the place per the weekly schedule) -- no confirmation needed, same
    // reasoning applied by every other status-only-when-closing gate in
    // this app.
    if (status === null) {
      applyStatusChange(null);
      return;
    }
    setPendingStatus(status);
  };

  const applyStatusChange = async (status: TemporaryStatus) => {
    setIsSavingStatus(true);
    try {
      const response = await setPlaceTemporaryStatus(
        placeId,
        status,
        status ? note || null : null,
      );
      if (response.status === 200) {
        setCurrentStatus(status);
        toast.success("Status updated successfully.");
        onChanged();
      } else {
        toast.error(response.message ?? "We couldn't update your status.");
      }
    } finally {
      setIsSavingStatus(false);
      setPendingStatus(undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Status</h3>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => requestStatusChange(option.value)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                currentStatus === option.value
                  ? "border-primary bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {currentStatus && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => applyStatusChange(currentStatus)}
            placeholder="Optional note for visitors (e.g. reason, reopening date)"
            className="w-full rounded-md border border-input bg-background p-2 text-sm"
            rows={2}
          />
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Weekly hours</h3>
        <PlaceOpeningHoursEditor openingHours={hours} onChange={setHours} />

        <button
          type="button"
          onClick={saveHours}
          disabled={isSavingHours}
          className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isSavingHours ? "Saving..." : "Save hours"}
        </button>
      </div>

      {pendingStatus !== undefined && (
        <ConfirmDeleteModal
          title={
            pendingStatus === "permanently_closed"
              ? "Mark as permanently closed?"
              : "Mark as temporarily closed?"
          }
          message={
            pendingStatus === "permanently_closed"
              ? "Mark this place as permanently closed? It will stop appearing as open in searches."
              : "Mark this place as temporarily closed? It will show as closed to visitors until you switch it back to Normal hours."
          }
          confirmLabel="Mark Closed"
          isLoading={isSavingStatus}
          onConfirm={() => applyStatusChange(pendingStatus)}
          onCancel={() => setPendingStatus(undefined)}
        />
      )}
    </div>
  );
}
