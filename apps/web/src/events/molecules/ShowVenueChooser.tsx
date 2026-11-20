"use client";

import PostAutoComplete from "@/components/atoms/PostAutoComplete";
import PlaceSearchSelect from "@/places/molecules/PlaceSearchSelect";
import type { AddEventShowsSchemaInput } from "@abonten/validation/showRunSchemas";
import { useTranslations } from "next-intl";
import { useState } from "react";

type ShowVenueBody = NonNullable<AddEventShowsSchemaInput["venue"]>;

/** Where new shows are: the listing's own venue, or another one (a tour). */
export type ShowVenueState =
  | { mode: "same" }
  | { mode: "other"; venue: ShowVenueBody | null; label: string | null };

/**
 * Manage › Shows: "At this venue" or "At another venue" for the shows and
 * copies the card makes (docs/architecture/show-runs.md, Tours). Another
 * venue is an address picked from the suggestions (its point is sent; the
 * server works out the country and clock) or an Abonten place.
 */
export default function ShowVenueChooser({
  value,
  onChange,
}: {
  value: ShowVenueState;
  onChange: (next: ShowVenueState) => void;
}) {
  const t = useTranslations("events");
  const [addressText, setAddressText] = useState("");
  const [place, setPlace] = useState<{ id: string; name: string } | null>(null);
  const other = value.mode === "other";

  const choose = (mode: "same" | "other") => {
    if (mode === value.mode) return;
    setPlace(null);
    setAddressText("");
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

      {other && (
        <div className="space-y-2">
          {!place && (
            <PostAutoComplete
              value={addressText}
              address={{
                address: (text: string) => {
                  setAddressText(text);
                  // Typing after a pick: the pick no longer holds.
                  if (value.label !== null && text !== value.label) {
                    onChange({ mode: "other", venue: null, label: null });
                  }
                },
              }}
              onSelectCoordinates={(loc) => {
                setAddressText(loc.address);
                onChange({
                  mode: "other",
                  venue: {
                    address: loc.address,
                    latitude: loc.lat,
                    longitude: loc.lng,
                  },
                  label: loc.address,
                });
              }}
              placeholderText={{
                text: t("showVenueAddress"),
                svgUrl: "/assets/images/location.svg",
              }}
            />
          )}
          <PlaceSearchSelect
            selectedPlaceId={place?.id ?? null}
            selectedPlaceName={place?.name ?? null}
            onSelect={(picked) => {
              setPlace({ id: picked.id, name: picked.name });
              onChange({
                mode: "other",
                venue: { placeId: picked.id },
                label: picked.name,
              });
            }}
            onClear={() => {
              setPlace(null);
              onChange({ mode: "other", venue: null, label: null });
            }}
          />
          {value.label ? (
            <p className="text-sm text-muted-foreground">
              {t("showVenueChosen", { venue: value.label })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("showVenuePickFirst")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
