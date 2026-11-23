"use client";

import { addPlaceSpecialHours } from "@/actions/addPlaceSpecialHours";
import { removePlaceSpecialHours } from "@/actions/removePlaceSpecialHours";
import { InlineDateField } from "@/components/atoms/InlineDateField";
import { TimeInput } from "@/components/atoms/TimeInput";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import PlaceSpecialHoursList from "@/places/molecules/PlaceSpecialHoursList";
import {
  type PlaceSpecialHourRow,
  SPECIAL_HOURS_LABEL_MAX,
  formatSpecialDate,
  placeLocalDate,
} from "@abonten/core/placeSpecialHours";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type ManagePlaceSpecialHoursSectionProps = {
  placeId: string;
  /** The place's zone (place.timezone): "today" is its today. */
  timeZone: string | null;
  /** Special dates from today on, soonest first. */
  specialHours: PlaceSpecialHourRow[];
  onChanged: () => void;
};

/** The picked calendar day as "yyyy-mm-dd" (the picker's local day). */
function toCalendarDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Special dates in a place's hours (PROJECT.md §90): holidays and other
// days with different hours, each replacing that day's weekly hours.
// Adding a date that already has special hours replaces them. Writes go
// through addPlaceSpecialHours / removePlaceSpecialHours, which run the
// same services as the app's routes.
export default function ManagePlaceSpecialHoursSection({
  placeId,
  timeZone,
  specialHours,
  onChanged,
}: ManagePlaceSpecialHoursSectionProps) {
  const t = useTranslations("places");
  const locale = useLocale();
  const toast = useToast();
  const confirm = useConfirm();

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [isClosed, setIsClosed] = useState(true);
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("17:00");
  const [label, setLabel] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const today = placeLocalDate(new Date(), timeZone);
  const [y, m, d] = today.split("-").map(Number);
  // The place's today as a local midnight, for the picker's lower bound.
  const earliest = new Date(y, m - 1, d);

  const save = async () => {
    if (!date) return;
    setIsSaving(true);
    try {
      const response = await addPlaceSpecialHours(placeId, {
        date: toCalendarDate(date),
        isClosed,
        openTime: isClosed ? null : openTime,
        closeTime: isClosed ? null : closeTime,
        label,
      });
      if (response.status === 200) {
        toast.success(t("specialDateSaved"));
        setDate(undefined);
        setLabel("");
        onChanged();
      } else {
        toast.error(response.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (row: PlaceSpecialHourRow) => {
    if (!row.id) return;
    const when = formatSpecialDate(row.special_date, locale);
    const confirmed = await confirm({
      title: t("removeSpecialDate", { date: when }),
      message: t("thisCanTBeUndone"),
      confirmLabel: t("remove2"),
    });
    if (!confirmed) return;
    setRemovingId(row.id);
    try {
      const response = await removePlaceSpecialHours(placeId, row.id);
      if (response.status === 200) {
        toast.success(t("specialDateRemoved"));
        onChanged();
      } else {
        toast.error(response.message);
      }
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {t("specialDates")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("specialDatesHint")}</p>
      </div>

      {specialHours.length > 0 ? (
        <PlaceSpecialHoursList
          rows={specialHours}
          today={today}
          onRemove={remove}
          removingId={removingId}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("noUpcomingSpecialDates")}
        </p>
      )}

      <div className="space-y-3 rounded-lg border border-border p-3">
        <h4 className="text-sm font-medium text-foreground">
          {t("addSpecialDate")}
        </h4>

        <InlineDateField
          label={t("date")}
          date={date}
          onSelect={setDate}
          disabledBefore={earliest}
        />

        <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={isClosed}
            onChange={(e) => setIsClosed(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          {t("specialDateClosedAllDay")}
        </label>

        {!isClosed && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {t("specialDateOpens")}
              </span>
              <TimeInput
                aria-label={t("specialDateOpens")}
                value={openTime}
                onChange={setOpenTime}
                className="w-auto"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {t("specialDateCloses")}
              </span>
              <TimeInput
                aria-label={t("specialDateCloses")}
                value={closeTime}
                onChange={setCloseTime}
                className="w-auto"
              />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label
            htmlFor="special-date-name"
            className="text-sm text-muted-foreground"
          >
            {t("specialDateName")}
          </label>
          <Input
            id="special-date-name"
            type="text"
            maxLength={SPECIAL_HOURS_LABEL_MAX}
            placeholder={t("specialDateNamePlaceholder")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={save}
          disabled={isSaving || !date}
          className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isSaving ? t("saving") : t("saveSpecialDate")}
        </button>
      </div>
    </div>
  );
}
