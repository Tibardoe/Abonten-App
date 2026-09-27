import { cn } from "../lib/utils";

type DateBtnProp = {
  key: string;
  dateString: string;
  day: string;
  month: string;
  date: number;
  start_at: string;
  is_past: boolean;
  isActive: boolean;
  onClick: () => void;
};

// One date of an event, as a compact calendar tile: weekday, day of the
// month, month and start time. The selected date takes the brand tint.
export default function DateBtn({
  day,
  month,
  date,
  start_at,
  is_past,
  dateString,
  onClick,
  isActive,
}: DateBtnProp) {
  return (
    <button
      type="button"
      key={dateString}
      disabled={is_past}
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={`${day} ${date} ${month}, ${start_at}`}
      className={cn(
        "flex min-w-[76px] flex-shrink-0 flex-col items-center gap-0.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
        isActive
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/60",
        is_past && "cursor-not-allowed opacity-50 hover:border-border",
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {day.slice(0, 3)}
      </span>
      <span className="text-2xl font-bold leading-tight">{date}</span>
      <span className="text-xs text-muted-foreground">{month.slice(0, 3)}</span>
      <span className="mt-1 text-xs font-medium">{start_at}</span>
    </button>
  );
}
