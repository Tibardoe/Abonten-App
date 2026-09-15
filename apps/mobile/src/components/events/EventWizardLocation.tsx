import { MapPickerSheet } from "@/components/explore/MapPickerSheet";
import type { EventWizard } from "@/features/events/useEventWizard";
import { useVenuePlaces } from "@/features/events/useVenuePlaces";
import { AppText, Field, Icon, Input } from "@abonten/ui-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

// Step 4 of the event wizard — the venue address. Same resolver as the
// place wizard's Basic-info step (autocomplete suggestions, "choose on
// map", or current location). An organizer who owns Abonten Places can
// also pin the event to one of them (the web PlaceSearchSelect echo): the
// address fills in from the place and the event is linked to it, so it
// shows under "Upcoming events here" on the place's page.
export function EventWizardLocation({ w }: { w: EventWizard }) {
  const [mapOpen, setMapOpen] = useState(false);
  const venues = useVenuePlaces();

  return (
    <View className="gap-4">
      {venues.length > 0 ? (
        <Field
          label="At one of your places?"
          hint="Pin the event to a place you manage and it appears on that place's page."
        >
          <View className="flex-row flex-wrap gap-2">
            {venues.map((v) => {
              const selected = w.venuePlace?.id === v.id;
              return (
                <Pressable
                  key={v.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${v.name}${selected ? ", selected" : ""}`}
                  onPress={() => w.setVenuePlace(selected ? null : v)}
                  className={`min-h-[40px] flex-row items-center gap-1.5 rounded-full border px-3 py-2 active:opacity-70 ${
                    selected
                      ? "border-primary bg-accent"
                      : "border-border bg-card"
                  }`}
                >
                  <Icon
                    name={selected ? "checkmark-circle" : "storefront-outline"}
                    size={16}
                    tone={selected ? "primary" : "muted"}
                  />
                  <AppText
                    variant="small"
                    className={selected ? "font-semibold" : undefined}
                    numberOfLines={1}
                  >
                    {v.name}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Field>
      ) : null}

      <Field
        label={w.venuePlace ? "Address" : "Location"}
        hint={
          w.venuePlace
            ? `Filled in from ${w.venuePlace.name}. Editing it unpins the place.`
            : "Search, choose on the map, or use your current location."
        }
      >
        <Input
          value={w.autocomplete.query}
          onChangeText={(v) => {
            if (w.venuePlace) w.setVenuePlace(null);
            w.autocomplete.setQuery(v);
          }}
          placeholder="Start typing an address…"
          autoCorrect={false}
        />
        {w.resolvingLocation ? (
          <View className="flex-row items-center gap-2 py-1">
            <ActivityIndicator size="small" />
            <AppText variant="meta">Resolving location…</AppText>
          </View>
        ) : null}
        {w.autocomplete.predictions.length > 0 ? (
          <View className="overflow-hidden rounded-lg border border-border">
            {w.autocomplete.predictions.map((p) => (
              <Pressable
                key={p.placeId}
                onPress={() => w.pickSuggestion(p.placeId)}
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
        <View className="flex-row gap-4">
          <Pressable
            onPress={() => setMapOpen(true)}
            className="min-h-[40px] flex-row items-center gap-2 py-1 active:opacity-70"
          >
            <Icon name="map-outline" size={16} tone="primary" />
            <AppText variant="small" tone="brand">
              Choose on map
            </AppText>
          </Pressable>
          <Pressable
            onPress={w.useCurrentLocation}
            className="min-h-[40px] flex-row items-center gap-2 py-1 active:opacity-70"
          >
            <Icon name="locate-outline" size={16} tone="primary" />
            <AppText variant="small" tone="brand">
              Current location
            </AppText>
          </Pressable>
        </View>
        {w.address && w.coords ? (
          <AppText variant="meta">Selected: {w.address}</AppText>
        ) : null}
      </Field>

      <MapPickerSheet
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        initial={w.coords}
        onPick={(loc) => w.setMapLocation(loc)}
      />
    </View>
  );
}
