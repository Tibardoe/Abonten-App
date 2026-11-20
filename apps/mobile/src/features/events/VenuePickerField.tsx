import { MapPickerSheet } from "@/components/explore/MapPickerSheet";
import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import { useVenuePlaces } from "@/features/events/useVenuePlaces";
import type { ShowVenueBody } from "@abonten/api-client";
import {
  AppText,
  Chip,
  Field,
  Icon,
  Input,
  useToast,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

export type PickedVenue = { venue: ShowVenueBody; label: string } | null;

/**
 * Another venue for an event: one of the organizer's own places, an
 * address picked from the suggestions or a point chosen on the map; the
 * server works out its country and clock. Used by Shows and copies (a tour)
 * and Move the event. Mirrors the website's VenuePicker.
 */
export function VenuePickerField({
  picked,
  onChange,
}: {
  picked: PickedVenue;
  onChange: (next: PickedVenue) => void;
}) {
  const t = useTranslations("events");
  const toast = useToast();
  const autocomplete = usePlacesAutocomplete();
  const places = useVenuePlaces();
  const [mapOpen, setMapOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const pickedPlaceId =
    picked && "placeId" in picked.venue ? picked.venue.placeId : null;

  const applyAddress = (lat: number, lng: number, address: string) => {
    autocomplete.fill(address);
    onChange({
      venue: { address, latitude: lat, longitude: lng },
      label: address,
    });
  };

  async function pickSuggestion(placeId: string) {
    setResolving(true);
    const resolved = await autocomplete.resolvePlace(placeId);
    setResolving(false);
    if (!resolved) {
      toast.error(t("couldnTUseThatLocation"), {
        description: t("pleaseTryAnotherSuggestionOrType"),
      });
      return;
    }
    applyAddress(resolved.lat, resolved.lng, resolved.address);
  }

  return (
    <View className="gap-3">
      {places.length > 0 ? (
        <Field label={t("atOneOfYourPlaces")}>
          <View className="flex-row flex-wrap gap-2">
            {places.map((place) => (
              <Chip
                key={place.id}
                label={place.name}
                selected={pickedPlaceId === place.id}
                onPress={() => {
                  autocomplete.fill(place.address);
                  onChange({ venue: { placeId: place.id }, label: place.name });
                }}
              />
            ))}
          </View>
        </Field>
      ) : null}

      <Field label={t("showVenueAddress")}>
        <Input
          value={autocomplete.query}
          onChangeText={(text) => {
            autocomplete.setQuery(text);
            // Typing after a pick: the pick no longer holds.
            if (picked) onChange(null);
          }}
          placeholder={t("startTypingAnAddress")}
          autoCorrect={false}
        />
        {resolving ? (
          <View className="flex-row items-center gap-2 py-1">
            <ActivityIndicator size="small" />
            <AppText variant="meta">{t("resolvingLocation2")}</AppText>
          </View>
        ) : null}
        {autocomplete.predictions.length > 0 ? (
          <View className="overflow-hidden rounded-lg border border-border">
            {autocomplete.predictions.map((p) => (
              <Pressable
                accessibilityRole="button"
                key={p.placeId}
                onPress={() => pickSuggestion(p.placeId)}
                className="border-border border-b px-3 py-2 active:opacity-70"
              >
                <AppText variant="small">{p.primary}</AppText>
                {p.secondary ? (
                  <AppText variant="caption">{p.secondary}</AppText>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => setMapOpen(true)}
          className="min-h-[40px] flex-row items-center gap-2 self-start py-1 active:opacity-70"
        >
          <Icon name="map-outline" size={16} tone="primary" />
          <AppText variant="small" tone="brand">
            {t("chooseOnMap")}
          </AppText>
        </Pressable>
      </Field>

      <AppText variant="meta">
        {picked
          ? t("showVenueChosen", { venue: picked.label })
          : t("showVenuePickFirst")}
      </AppText>

      <MapPickerSheet
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        initial={null}
        onPick={(loc) => applyAddress(loc.lat, loc.lng, loc.label)}
      />
    </View>
  );
}
