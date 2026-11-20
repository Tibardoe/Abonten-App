"use client";

import { useTranslations } from "next-intl";
import VenuePicker, { type EventVenueBody } from "./VenuePicker";

/** Where new shows are: the listing's own venue, or another one (a tour). */
export type ShowVenueState =
  | { mode: "same" }
  | { mode: "other"; venue: EventVenueBody | null; label: string | null };

/**
 * Manage › Shows: "At this venue" or "At another venue" for the shows and
 * copies the card makes (docs/architecture/show-runs.md, Tours).
 */
export default function ShowVenueChooser({
  value,
  onChange,
}: {
  value: ShowVenueState;
  onChange: (next: ShowVenueState) => void;
}) {
  const t = useTranslations("events");

  const choose = (mode: "same" | "other") => {
    if (mode === value.mode) return;
    onChange(mode === "same" ? { mode } : { mode, venue: null, label: null });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("showVenue")}</p>
      <div className="flex flex-wrap gap-2">
        {(["same", "other"] as const).map((mode) => {
          const on = value.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={on}
              onClick={() => choose(mode)}
              className={`rounded-full border px-3 py-1 text-sm ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border"
              }`}
            >
              {mode === "same" ? t("showVenueSame") : t("showVenueOther")}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t("showVenueHint")}</p>

      {value.mode === "other" && (
        <VenuePicker
          picked={
            value.venue && value.label
              ? { venue: value.venue, label: value.label }
              : null
          }
          onChange={(next) =>
            onChange({
              mode: "other",
              venue: next?.venue ?? null,
              label: next?.label ?? null,
            })
          }
        />
      )}
    </div>
  );
}
