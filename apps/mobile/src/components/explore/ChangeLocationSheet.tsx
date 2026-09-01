import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
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

// Native echo of the web ChangeLocationModal ("Set your location") — the
// same two actions: type an address (forward-geocoded), or use the current
// device position. The web modal also offers a full map picker and Google
// autocomplete suggestions; those are a later pass (noted in
// docs/mobile/09).

export function ChangeLocationSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { location, setTypedLocation, useCurrentLocation } =
    useExploreLocation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"typed" | "current" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitTyped() {
    if (!text.trim() || busy) return;
    setBusy("typed");
    setError(null);
    const ok = await setTypedLocation(text);
    setBusy(null);
    if (ok) {
      setText("");
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
    <Sheet open={open} onClose={onClose} title="Set your location">
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
              value={text}
              onChangeText={setText}
              onSubmitEditing={submitTyped}
              returnKeyType="search"
            />
          </View>
          <Button
            title="Set"
            onPress={submitTyped}
            loading={busy === "typed"}
            disabled={!text.trim()}
          />
        </View>

        <Divider />

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
          <AppText className="text-[13px] text-destructive">{error}</AppText>
        ) : null}
      </View>
    </Sheet>
  );
}
