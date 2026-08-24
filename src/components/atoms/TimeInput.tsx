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
    // Mobile Safari has a documented quirk where input[type=time] ignores a
    // block-level width:100% set on the input itself and renders its
    // internal hour/minute/AM-PM segments at their own native minimum,
    // overflowing past the box. Putting the flex context on this wrapper
    // instead, with flex-1 + min-w-0 on the input, makes the browser
    // actually shrink the control to the available space (the standard fix
    // for this exact class of bug) rather than relying on width alone.
    <div className={cn("flex min-w-0", className)}>
      <Input
        type="time"
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // "block" overrides the shared Input component's own "flex" --
        // fine for a plain text input, but setting display:flex on
        // input[type=time]/date itself (rather than a wrapper) is a
        // separate known WebKit quirk that stretches the rightmost
        // segment on focus/reveal.
        className="block min-w-0 max-w-full flex-1"
      />
    </div>
  );
}
