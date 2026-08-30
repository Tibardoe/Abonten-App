"use client";

import { Slider } from "@/components/ui/slider";

type PriceRangeSliderProps = {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  // How to render the max value when it's pinned at `max` (e.g. "Any" for an
  // uncapped price filter) -- falls back to the raw number otherwise.
  formatMax?: (value: number) => string;
  currencyPrefix?: string;
};

// Touch-friendly dual-handle range slider for price/rating-style filters,
// replacing the third-party react-range-slider-input widget (unbranded,
// small handles, no dark-mode-aware styling) with the app's own Radix-backed
// Slider. The two number inputs above the track stay in sync with it in both
// directions and can never cross -- typing a min above the current max (or
// vice versa) clamps instead of producing an invalid range.
export default function PriceRangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  formatMax,
  currencyPrefix = "",
}: PriceRangeSliderProps) {
  const [low, high] = value;

  const handleSliderChange = (next: number[]) => {
    // Radix already keeps the pair sorted and non-crossing, but normalize
    // defensively so a stray single-element or reversed payload can never
    // leave the control in an invalid state.
    const [a = min, b = max] = next;
    onChange([Math.min(a, b), Math.max(a, b)]);
  };

  const handleLowInput = (raw: string) => {
    // An empty field parses as 0, not NaN -- treat it as "no change yet"
    // rather than snapping the minimum to 0 mid-edit. `high - step` keeps
    // the two values from ever colliding (which would make one slider thumb
    // impossible to separate from the other again).
    if (raw.trim() === "") return;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.min(Math.max(parsed, min), high - step);
    onChange([Math.min(clamped, high - step), high]);
  };

  const handleHighInput = (raw: string) => {
    if (raw.trim() === "") return;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(Math.min(parsed, max), low + step);
    onChange([low, Math.max(clamped, low + step)]);
  };

  const highLabel = formatMax && high >= max ? formatMax(high) : `${high}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-1 rounded-lg bg-muted px-2">
          <span className="text-xs text-muted-foreground">
            {currencyPrefix}
          </span>
          <input
            type="number"
            inputMode="numeric"
            aria-label="Minimum price"
            value={low}
            min={min}
            max={high}
            onChange={(e) => handleLowInput(e.target.value)}
            className="h-9 w-20 bg-transparent text-center text-sm outline-none"
          />
        </label>

        <span className="text-muted-foreground" aria-hidden>
          –
        </span>

        <label className="flex items-center gap-1 rounded-lg bg-muted px-2">
          <span className="text-xs text-muted-foreground">
            {currencyPrefix}
          </span>
          <input
            type="number"
            inputMode="numeric"
            aria-label="Maximum price"
            value={high}
            min={low}
            max={max}
            onChange={(e) => handleHighInput(e.target.value)}
            className="h-9 w-20 bg-transparent text-center text-sm outline-none"
          />
        </label>
      </div>

      <div className="px-4">
        <Slider
          min={min}
          max={max}
          step={step}
          minStepsBetweenThumbs={1}
          value={[low, high]}
          onValueChange={handleSliderChange}
          aria-label="Price range"
        />
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {currencyPrefix}
          {low}
        </span>
        <span>
          {currencyPrefix}
          {highLabel}
        </span>
      </div>
    </div>
  );
}
