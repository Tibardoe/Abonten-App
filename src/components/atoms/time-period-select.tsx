import { cn } from "../lib/utils";
import type { Period } from "./time-picker-utils";

interface TimePeriodSelectProps {
  period: Period;
  setPeriod: (period: Period) => void;
}

// AM/PM toggle for the 12-hour time picker. Two plain buttons rather than a
// dropdown to match this codebase's existing hand-rolled toggle style (see
// DateTimeSelectorBtn) -- no shadcn Select primitive exists here yet, and a
// two-option toggle doesn't need one.
export function TimePeriodSelect({ period, setPeriod }: TimePeriodSelectProps) {
  return (
    <div className="flex rounded-md border border-input overflow-hidden text-xs">
      {(["AM", "PM"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={period === option}
          onClick={() => setPeriod(option)}
          className={cn(
            "px-2 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            period === option
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-accent",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
