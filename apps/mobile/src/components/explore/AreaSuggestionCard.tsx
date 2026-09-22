import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { AppText, Button, Icon, useToast } from "@abonten/ui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

// "You're now in Kumasi" — shown under the location switcher while the
// person is browsing an area they chose and the phone has since moved on
// to another town (the rule, its distances and when it stays quiet are in
// @abonten/core/location/browsingArea). One tap follows the phone again;
// the cross puts it away for as long as the phone stays around here. It is
// a row in the page, never a toast or an alert, so it interrupts nothing.

export function AreaSuggestionCard() {
  const { area, suggestion, followDevice, dismissSuggestion } =
    useExploreLocation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!suggestion || !area || area.mode !== "chosen") return null;

  async function useCurrent() {
    if (busy) return;
    setBusy(true);
    const outcome = await followDevice();
    setBusy(false);
    if (outcome !== "ok")
      toast.error("We couldn't get your location right now.");
  }

  return (
    <View className="mx-4 mb-2 flex-row items-start gap-3 rounded-xl border border-border bg-card px-3 py-3">
      <Icon name="navigate-circle-outline" size={24} tone="primary" />
      <View className="flex-1 gap-2">
        <View>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {suggestion.label
              ? `You're now in ${suggestion.label}`
              : "You're somewhere new"}
          </AppText>
          <AppText variant="meta" numberOfLines={1}>
            Still browsing {area.label}
          </AppText>
        </View>
        <View className="flex-row">
          <Button
            title="Use my location"
            size="sm"
            onPress={useCurrent}
            loading={busy}
            loadingTitle="Locating…"
          />
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={10}
        onPress={dismissSuggestion}
        className="active:opacity-60"
      >
        <Icon name="close" size={20} tone="muted" />
      </Pressable>
    </View>
  );
}
