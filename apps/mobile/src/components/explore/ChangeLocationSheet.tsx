import {
  type ChooseOutcome,
  type FollowOutcome,
  useExploreLocation,
} from "@/features/discovery/ExploreLocationProvider";
import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import {
  AppText,
  Button,
  Icon,
  Sheet,
  SheetOption,
  useModalHandoff,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useCallback, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import {
  type LocationSearchError,
  LocationSearchOverlay,
} from "./LocationSearchOverlay";
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
// Searching happens full screen (LocationSearchOverlay): the sheet shows a
// field-shaped button, and tapping it opens the search with the keyboard up,
// the field at the top and the suggestions below it. Typed into the sheet
// itself, the keyboard covered the field's lower half and every suggestion.
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
  denied: "allowLocationForAbontenToFollow",
  blocked: "locationIsTurnedOffForAbonten",
  unavailable: "weCouldnTGetYourLocation",
};

const CHOOSE_MESSAGES: Record<Exclude<ChooseOutcome, "ok">, string> = {
  not_found: "weCouldnTFindThatAddress",
  offline: "youReOfflineTryAgainWhen",
};

export function ChangeLocationSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("explore");

  const { area, devicePermission, chooseTypedArea, followDevice, chooseArea } =
    useExploreLocation();
  const auto = usePlacesAutocomplete(
    area ? { lat: area.lat, lng: area.lng } : null,
  );
  const [busy, setBusy] = useState<"typed" | "current" | "pick" | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [error, setError] = useState<LocationSearchError | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const handoff = useModalHandoff();
  const shown = describeArea(area, devicePermission);

  function finish() {
    auto.setQuery("");
    auto.clear();
    setError(null);
    setSearchOpen(false);
    onClose();
  }

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setError(null);
  }, []);

  async function pickPrediction(placeId: string) {
    if (busy) return;
    setBusy("pick");
    setPickingId(placeId);
    setError(null);
    // The area is named after the suggestion that was tapped ("Kejetia
    // Market"), as on the website; Google's formatted address for the
    // place can read differently ("Kumasi kejetis markets, Kejetia Road").
    const picked = auto.predictions.find((p) => p.placeId === placeId);
    const resolved = await auto.resolvePlace(placeId);
    setBusy(null);
    setPickingId(null);
    if (resolved) {
      await chooseArea(
        resolved.lat,
        resolved.lng,
        picked?.primary || resolved.address,
      );
      finish();
    } else {
      setError({ message: t(CHOOSE_MESSAGES.not_found) });
    }
  }

  async function submitTyped() {
    if (!auto.query.trim() || busy) return;
    setBusy("typed");
    setError(null);
    const outcome = await chooseTypedArea(auto.query);
    setBusy(null);
    if (outcome === "ok") finish();
    else setError({ message: t(CHOOSE_MESSAGES[outcome]) });
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
        message: t(FOLLOW_MESSAGES[outcome]),
        settings: outcome === "blocked",
      });
  }

  function chooseOnMap() {
    setSearchOpen(false);
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
        title={t("setYourLocation")}
        minHeightRatio={0.45}
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

          {/* Opens the full-screen search; shaped like the field it opens. */}
          <Pressable
            accessibilityRole="search"
            accessibilityLabel={t("searchACityTownOrAddress")}
            onPress={() => {
              setError(null);
              setSearchOpen(true);
            }}
            className="h-12 flex-row items-center gap-2 rounded-xl border border-input bg-card px-3 active:opacity-80"
          >
            <Icon name="search-outline" size={18} tone="muted" />
            <AppText
              variant="body"
              tone={auto.query ? "primary" : "muted"}
              numberOfLines={1}
              className="flex-1"
            >
              {auto.query || t("searchACityTownOrAddress")}
            </AppText>
          </Pressable>

          <SheetOption
            icon="navigate"
            title={
              busy === "current" ? t("findingYou") : t("useMyCurrentLocation")
            }
            subtitle={
              shown.status === "near_you"
                ? t("alreadyFollowingYouAsYouMove")
                : t("followsYouAsYouMove")
            }
            onPress={submitCurrent}
            disabled={busy !== null && busy !== "current"}
          />

          <SheetOption
            icon="map-outline"
            title={t("chooseOnMap")}
            subtitle={t("moveTheMapUnderThePin")}
            onPress={chooseOnMap}
            disabled={busy !== null}
          />

          {error && !searchOpen ? (
            <View className="gap-2">
              <AppText variant="small" tone="error">
                {error.message}
              </AppText>
              {error.settings ? (
                <View className="flex-row">
                  <Button
                    title={t("openSettings")}
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

      <LocationSearchOverlay
        open={searchOpen}
        onClose={closeSearch}
        query={auto.query}
        onQueryChange={auto.setQuery}
        predictions={auto.predictions}
        loading={auto.loading}
        pickingId={pickingId}
        busy={busy}
        error={error}
        followingNow={shown.status === "near_you"}
        onPick={pickPrediction}
        onSubmitTyped={submitTyped}
        onUseCurrent={submitCurrent}
        onChooseOnMap={chooseOnMap}
      />

      <MapPickerSheet
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        initial={area ? { lat: area.lat, lng: area.lng } : null}
      />
    </>
  );
}
