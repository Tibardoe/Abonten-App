"use client";

import PostAutoComplete from "@/components/atoms/PostAutoComplete";
import PlaceSearchSelect from "@/places/molecules/PlaceSearchSelect";
import type { AddEventShowsSchemaInput } from "@abonten/validation/showRunSchemas";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** An Abonten place, or an address with its point (the server checks it). */
export type EventVenueBody = NonNullable<AddEventShowsSchemaInput["venue"]>;

export type PickedVenue = { venue: EventVenueBody; label: string } | null;

/**
 * Another venue for an event: an address picked from the suggestions (its
 * point is sent; the server works out the country and clock) or an Abonten
 * place. Used by the Shows card (a tour) and Move the event.
 */
export default function VenuePicker({
  picked,
  onChange,
}: {
  picked: PickedVenue;
  onChange: (next: PickedVenue) => void;
}) {
  const t = useTranslations("events");
  const [addressText, setAddressText] = useState("");
  const [place, setPlace] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="space-y-2">
      {!place && (
        <PostAutoComplete
          value={addressText}
          address={{
            address: (text: string) => {
              setAddressText(text);
              // Typing after a pick: the pick no longer holds.
              if (picked && text !== picked.label) onChange(null);
            },
          }}
          onSelectCoordinates={(loc) => {
            setAddressText(loc.address);
            onChange({
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
        onSelect={(chosen) => {
          setPlace({ id: chosen.id, name: chosen.name });
          onChange({ venue: { placeId: chosen.id }, label: chosen.name });
        }}
        onClear={() => {
          setPlace(null);
          onChange(null);
        }}
      />
      {picked ? (
        <p className="text-sm text-muted-foreground">
          {t("showVenueChosen", { venue: picked.label })}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("showVenuePickFirst")}
        </p>
      )}
    </div>
  );
}
