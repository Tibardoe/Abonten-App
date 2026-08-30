import type { PlaceOpeningHourRow } from "@abonten/core/computePlaceOpenStatus";
import { DISPLAY_DAYS } from "@abonten/core/dayOfWeek";

type PlaceOpeningHoursTableProps = {
  openingHours: PlaceOpeningHourRow[];
  // Injectable for predictable rendering; defaults to the render-time day.
  // No per-place timezone column exists (same single-timezone assumption
  // made elsewhere in this app, e.g. proxy.ts's default "GH" country code) —
  // and Ghana has no DST and sits at UTC+0, so a server-rendered "today"
  // matches Ghana wall-clock time exactly, unlike most other timezones.
  today?: number;
};

function formatTime(time: string): string {
  const [hoursStr, minutesStr] = time.split(":");
  const hours24 = Number(hoursStr);
  const minutes = Number(minutesStr ?? 0);
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

export default function PlaceOpeningHoursTable({
  openingHours,
  today = new Date().getDay(),
}: PlaceOpeningHoursTableProps) {
  return (
    <div className="divide-y divide-border">
      {DISPLAY_DAYS.map(({ dayOfWeek, label }) => {
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
                ? "Closed"
                : `${formatTime(hour.open_time)} - ${formatTime(hour.close_time)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
