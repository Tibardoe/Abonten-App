import { formatClockTime } from "@abonten/core/computePlaceOpenStatus";
import {
  type PlaceSpecialHourRow,
  formatSpecialDate,
} from "@abonten/core/placeSpecialHours";
import { useLocale, useTranslations } from "next-intl";
import { IoTrashOutline } from "react-icons/io5";

type PlaceSpecialHoursListProps = {
  rows: readonly PlaceSpecialHourRow[];
  /** Today's date at the place ("yyyy-mm-dd"), to mark it. */
  today?: string;
  /** The owner's editor: remove one date. */
  onRemove?: (row: PlaceSpecialHourRow) => void;
  removingId?: string | null;
};

// Special dates of a place's hours (place_special_hours, PROJECT.md §90):
// one row per date, its name if any, and "Closed" or its own hours. The
// public place page shows it read-only; the owner's editor adds a remove
// button. Mirrors the app's PlaceSpecialHoursList.
export default function PlaceSpecialHoursList({
  rows,
  today,
  onRemove,
  removingId,
}: PlaceSpecialHoursListProps) {
  const t = useTranslations("places");
  const locale = useLocale();

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const date = formatSpecialDate(row.special_date, locale);
        const isToday = today != null && row.special_date === today;
        return (
          <li
            key={row.id ?? row.special_date}
            className={`flex items-center justify-between gap-3 py-2.5 text-sm ${
              isToday
                ? "bg-primary/5 -mx-2 px-2 rounded-md font-semibold text-card-foreground"
                : "text-muted-foreground"
            }`}
          >
            <div className="min-w-0">
              <p>
                {date}
                {isToday ? (
                  <span className="ml-2 text-xs text-primary">
                    {t("today")}
                  </span>
                ) : null}
              </p>
              {row.label ? (
                <p className="text-xs text-muted-foreground font-normal">
                  {row.label}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span>
                {row.is_closed || !row.open_time || !row.close_time
                  ? t("closed")
                  : `${formatClockTime(row.open_time, locale)} – ${formatClockTime(row.close_time, locale)}`}
              </span>
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(row)}
                  disabled={removingId === row.id}
                  aria-label={t("removeSpecialDate", { date })}
                  className="p-1 text-destructive hover:opacity-70 disabled:opacity-40"
                >
                  <IoTrashOutline aria-hidden />
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
