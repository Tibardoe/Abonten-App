import {
  type ChooseOutcome,
  type FollowOutcome,
  useExploreLocation,
} from "@/features/discovery/ExploreLocationProvider";
import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import {
  AppText,
  Button,
  Divider,
  Icon,
  Input,
  Sheet,
  SheetOption,
  useModalHandoff,
} from "@abonten/ui-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { MapPickerSheet } from "./MapPickerSheet";
import { describeArea } from "./areaCopy";

// The location sheet — native echo of the web ChangeLocationModal ("Set
// your location"), organised around the two things a person can mean:
//
//   * "show me what's near me" — Use my current location, first, and the
//     area then follows the phone as they move; or
//   * "show me this place" — an address or city (Google Places
//     autocomplete, with a raw-text forward-geocode fallback) or a point on
//     the map; the area then stays put wherever the phone goes.
//
// It opens on a plain statement of what is being shown and why (near you /
// chosen / location off), so nobody has to guess what the list below the
// switcher is for.
//
// "Choose on map" hands off between two modals: this sheet closes first and
// the full-screen map picker opens only from the sheet's `onDismiss`, once
// the native dismissal has finished. Opening the picker on top of the still
// -open sheet and then closing both at once left the app unresponsive on
// iOS until it was force-quit (see useModalHandoff.ts). The picker owns its
// own open state so it can be up while the parent's `open` is false.

const FOLLOW_MESSAGES: Record<Exclude<FollowOutcome, "ok">, string> = {
  denied: "Allow location for Abonten to follow where you are.",
  blocked:
    "Location is turned off for Abonten. Turn it on in Settings to follow where you are.",
  unavailable:
    "We couldn't get your location. Check that location is on and try again.",
};

const CHOOSE_MESSAGES: Record<Exclude<ChooseOutcome, "ok">, string> = {
  not_found: "We couldn't find that address. Try another.",
  offline: "You're offline. Try again when you're back online.",
};

export function ChangeLocationSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { area, devicePermission, chooseTypedArea, followDevice, chooseArea } =
    useExploreLocation();
  const auto = usePlacesAutocomplete(
    area ? { lat: area.lat, lng: area.lng } : null,
  );
  const [busy, setBusy] = useState<"typed" | "current" | "pick" | null>(null);
  const [error, setError] = useState<{
    message: string;
    settings?: boolean;
  } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const handoff = useModalHandoff();
  const shown = describeArea(area, devicePermission);

  function finish() {
    auto.setQuery("");
    auto.clear();
    setError(null);
    onClose();
  }

  async function pickPrediction(placeId: string) {
    if (busy) return;
    setBusy("pick");
    setError(null);
    const resolved = await auto.resolvePlace(placeId);
    setBusy(null);
    if (resolved) {
      await chooseArea(resolved.lat, resolved.lng, resolved.address);
      finish();
    } else {
      setError({ message: CHOOSE_MESSAGES.not_found });
    }
  }

  async function submitTyped() {
    if (!auto.query.trim() || busy) return;
    setBusy("typed");
    setError(null);
    const outcome = await chooseTypedArea(auto.query);
    setBusy(null);
    if (outcome === "ok") finish();
    else setError({ message: CHOOSE_MESSAGES[outcome] });
  }

  async function submitCurrent() {
    if (busy) return;
    setBusy("current");
    setError(null);
    const outcome = await followDevice();
    setBusy(null);
    if (outcome === "ok") finish();
    else
      setError({
        message: FOLLOW_MESSAGES[outcome],
        settings: outcome === "blocked",
      });
  }

  function chooseOnMap() {
    handoff.after(() => setMapOpen(true));
    onClose();
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={() => {
          handoff.cancel();
          setError(null);
          onClose();
        }}
        onDismiss={handoff.onDismiss}
        title="Set your location"
        minHeightRatio={0.62}
      >
        <View className="gap-4">
          <View className="flex-row items-start gap-2">
            <Icon
              name={shown.icon}
              size={18}
              tone={shown.status === "location_off" ? "muted" : "primary"}
            />
            <AppText variant="meta" className="flex-1">
              {shown.sentence}
            </AppText>
          </View>

          <SheetOption
            icon="navigate"
            title={
              busy === "current" ? "Finding you…" : "Use my current location"
            }
            subtitle={
              shown.status === "near_you"
                ? "Already following you as you move"
                : "Follows you as you move"
            }
            onPress={submitCurrent}
            disabled={busy !== null && busy !== "current"}
          />

          <Divider />

          <View className="flex-row items-end gap-2">
            <View className="flex-1">
              <Input
                placeholder="Search a city, town or address"
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
                  accessibilityRole="button"
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

          <Pressable
            accessibilityRole="button"
            onPress={chooseOnMap}
            className="min-h-[44px] flex-row items-center gap-2 py-1 active:opacity-70"
          >
            <Icon name="map-outline" size={20} tone="primary" />
            <AppText variant="bodyStrong">Choose on map</AppText>
          </Pressable>

          {error ? (
            <View className="gap-2">
              <AppText variant="small" tone="error">
                {error.message}
              </AppText>
              {error.settings ? (
                <View className="flex-row">
                  <Button
                    title="Open settings"
                    variant="outline"
                    size="sm"
                    onPress={() => Linking.openSettings()}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Sheet>

      <MapPickerSheet
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        initial={area ? { lat: area.lat, lng: area.lng } : null}
      />
    </>
  );
}
