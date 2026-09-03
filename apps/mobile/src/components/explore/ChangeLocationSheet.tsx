import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import {
  AppText,
  Button,
  Divider,
  Icon,
  Input,
  Sheet,
} from "@abonten/ui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { MapPickerSheet } from "./MapPickerSheet";

// Native echo of the web ChangeLocationModal ("Set your location"): Google
// Places autocomplete on the address field, a raw-text forward-geocode
// fallback, "Choose on map" (the MapPicker), and "Use my current location".

export function ChangeLocationSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { location, setTypedLocation, useCurrentLocation, setPickedLocation } =
    useExploreLocation();
  const auto = usePlacesAutocomplete();
  const [busy, setBusy] = useState<"typed" | "current" | "pick" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  async function pickPrediction(placeId: string) {
    if (busy) return;
    setBusy("pick");
    setError(null);
    const resolved = await auto.resolvePlace(placeId);
    setBusy(null);
    if (resolved) {
      await setPickedLocation(resolved.lat, resolved.lng, resolved.address);
      auto.setQuery("");
      auto.clear();
      onClose();
    } else {
      setError("We couldn't resolve that place. Try another.");
    }
  }

  async function submitTyped() {
    if (!auto.query.trim() || busy) return;
    setBusy("typed");
    setError(null);
    const ok = await setTypedLocation(auto.query);
    setBusy(null);
    if (ok) {
      auto.setQuery("");
      auto.clear();
      onClose();
    } else {
      setError("We couldn't find that address. Try another.");
    }
  }

  async function submitCurrent() {
    if (busy) return;
    setBusy("current");
    setError(null);
    const ok = await useCurrentLocation();
    setBusy(null);
    if (ok) onClose();
    else
      setError("Location permission is off, or the position is unavailable.");
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="Set your location"
        minHeightRatio={0.62}
      >
        <View className="gap-4">
          {location ? (
            <AppText variant="caption">
              Current: {location.label}
              {location.isFallback ? " (default)" : ""}
            </AppText>
          ) : null}

          <View className="flex-row items-end gap-2">
            <View className="flex-1">
              <Input
                placeholder="Enter an address or city"
                autoCapitalize="words"
                value={auto.query}
                onChangeText={auto.setQuery}
                onSubmitEditing={submitTyped}
                returnKeyType="search"
              />
            </View>
            <Button
              title="Set"
              onPress={submitTyped}
              loading={busy === "typed"}
              disabled={!auto.query.trim()}
            />
          </View>

          {auto.predictions.length > 0 ? (
            <View className="overflow-hidden rounded-lg border border-border">
              {auto.predictions.map((p, i) => (
                <Pressable
                  key={p.placeId}
                  onPress={() => pickPrediction(p.placeId)}
                  className={`flex-row items-center gap-2 px-3 py-2.5 active:opacity-70 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <Icon name="location-outline" size={16} tone="muted" />
                  <View className="flex-1">
                    <AppText variant="small" numberOfLines={1}>
                      {p.primary}
                    </AppText>
                    {p.secondary ? (
                      <AppText variant="caption" numberOfLines={1}>
                        {p.secondary}
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Divider />

          <Pressable
            accessibilityRole="button"
            onPress={() => setMapOpen(true)}
            className="flex-row items-center gap-2 py-1 active:opacity-70"
          >
            <Icon name="map-outline" size={20} tone="primary" />
            <AppText variant="bodyStrong">Choose on map</AppText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={submitCurrent}
            className="flex-row items-center gap-2 py-1 active:opacity-70"
          >
            <Icon name="locate-outline" size={20} tone="primary" />
            <AppText variant="bodyStrong">
              {busy === "current" ? "Locating…" : "Use my current location"}
            </AppText>
          </Pressable>

          {error ? (
            <AppText variant="small" tone="error">
              {error}
            </AppText>
          ) : null}
        </View>
      </Sheet>

      <MapPickerSheet
        open={mapOpen}
        onClose={() => {
          setMapOpen(false);
          onClose();
        }}
        initial={location ? { lat: location.lat, lng: location.lng } : null}
      />
    </>
  );
}
