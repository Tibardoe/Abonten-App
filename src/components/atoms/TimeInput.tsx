"use client";

import { Input } from "@/components/ui/input";
import { cn } from "../lib/utils";

type TimeInputProps = {
  value: string; // "HH:MM", 24-hour wall-clock -- native <input type="time">'s own format
  onChange: (value: string) => void;
  "aria-label"?: string;
  id?: string;
  className?: string;
};

// Single source of truth for time-of-day entry across the app: a native
// <input type="time">, styled with the same standardized Input classes used
// everywhere else. Chosen over a custom segmented picker because it already
// renders as a native wheel picker on iOS/Android (the "iPhone-inspired"
// interaction the brief asks for) and it's the exact interaction already
// validated in production for Place opening hours -- reusing it here instead
// of maintaining two different time-picker implementations. The browser
// handles 12-hour/AM-PM vs 24-hour display per the user's own device locale,
// so there's nothing to force or default incorrectly.
export function TimeInput({
  value,
  onChange,
  "aria-label": ariaLabel,
  id,
  className,
}: TimeInputProps) {
  return (
    <Input
      type="time"
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // min-w-0 lets this shrink inside a flex/grid parent instead of
      // forcing it wider (the default min-width:auto on flex/grid items
      // blocks shrinking below content size); max-w-full is a second guard
      // against a mobile browser's native time-picker control rendering
      // wider than its box, which previously pushed the whole page into
      // horizontal-scroll territory.
      className={cn("min-w-0 max-w-full", className)}
    />
  );
}
