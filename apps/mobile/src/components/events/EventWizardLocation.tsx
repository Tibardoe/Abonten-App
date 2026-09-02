import { MapPickerSheet } from "@/components/explore/MapPickerSheet";
import type { EventWizard } from "@/features/events/useEventWizard";
import { AppText, Field, Icon, Input } from "@abonten/ui-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

// Step 4 of the event wizard — the venue address. Same resolver as the
// place wizard's Basic-info step (autocomplete suggestions, "choose on
// map", or current location). The optional Abonten-Place venue picker the
// web form also offers is deferred.
export function EventWizardLocation({ w }: { w: EventWizard }) {
  const [mapOpen, setMapOpen] = useState(false);

  return (
    <View className="gap-4">
      <Field
        label="Location"
        hint="Search, choose on the map, or use your current location."
      >
        <Input
          value={w.autocomplete.query}
          onChangeText={w.autocomplete.setQuery}
          placeholder="Start typing an address…"
          autoCorrect={false}
        />
        {w.resolvingLocation ? (
          <View className="flex-row items-center gap-2 py-1">
            <ActivityIndicator size="small" />
            <AppText className="text-[12px] text-muted-foreground">
              Resolving location…
            </AppText>
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
                <AppText className="text-[13px] text-foreground">
                  {p.primary}
                </AppText>
                {p.secondary ? (
                  <AppText className="text-[11px] text-muted-foreground">
                    {p.secondary}
                  </AppText>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
        <View className="flex-row gap-4">
          <Pressable
            onPress={() => setMapOpen(true)}
            className="flex-row items-center gap-2 py-1 active:opacity-70"
          >
            <Icon name="map-outline" size={16} tone="primary" />
            <AppText className="text-[13px] text-primary">
              Choose on map
            </AppText>
          </Pressable>
          <Pressable
            onPress={w.useCurrentLocation}
            className="flex-row items-center gap-2 py-1 active:opacity-70"
          >
            <Icon name="locate-outline" size={16} tone="primary" />
            <AppText className="text-[13px] text-primary">
              Current location
            </AppText>
          </Pressable>
        </View>
        {w.address && w.coords ? (
          <AppText className="text-[12px] text-muted-foreground">
            Selected: {w.address}
          </AppText>
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
