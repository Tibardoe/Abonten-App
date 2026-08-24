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
      // "block" overrides the shared Input component's own "flex" -- fine
      // for a plain text input, but a known WebKit quirk on
      // <input type="time">/type="date"> is that setting display:flex on
      // the host element itself (rather than leaving it as a normal
      // replaced element) makes the browser lay out the control's internal
      // hour/minute/AM-PM segments along that flex axis too, stretching the
      // rightmost segment out past the box on focus. Place's original raw
      // time input (before this shared component existed) never had
      // "flex" and never showed this. min-w-0 lets this shrink inside a
      // flex/grid parent instead of forcing it wider; max-w-full is a
      // second guard against the control rendering wider than its box.
      className={cn("block min-w-0 max-w-full", className)}
    />
  );
}
