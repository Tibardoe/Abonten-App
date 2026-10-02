import {
  type PlaceOpeningHourRow,
  formatClockTime,
} from "@abonten/core/computePlaceOpenStatus";
import { displayDays } from "@abonten/core/dayOfWeek";
import { useLocale, useTranslations } from "next-intl";

type PlaceOpeningHoursTableProps = {
  openingHours: PlaceOpeningHourRow[];
  // The weekday at the PLACE (its own zone — the page passes
  // placeLocalNow(now, place.timezone).dow); defaults to the render-time day.
  today?: number;
};

export default function PlaceOpeningHoursTable({
  openingHours,
  today = new Date().getDay(),
}: PlaceOpeningHoursTableProps) {
  const t = useTranslations("places");
  const locale = useLocale();

  return (
    <div className="divide-y divide-border">
      {displayDays(locale).map(({ dayOfWeek, label }) => {
        const hour = openingHours.find((h) => h.day_of_week === dayOfWeek);
        const isToday = dayOfWeek === today;

        return (
          <div
            key={dayOfWeek}
            className={`flex items-center justify-between py-2.5 text-sm ${
              isToday
                ? "bg-primary/5 -mx-2 px-2 rounded-md font-semibold text-card-foreground"
                : "text-muted-foreground"
            }`}
          >
            <span>{label}</span>
            <span>
              {!hour || hour.is_closed || !hour.open_time || !hour.close_time
                ? t("closed")
                : `${formatClockTime(hour.open_time, locale)} – ${formatClockTime(hour.close_time, locale)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
