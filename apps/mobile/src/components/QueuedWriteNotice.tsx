import { AppText, Icon } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

// Writes use React Query's `networkMode: "online"`, so a mutation fired with
// no connection is parked rather than failed or retried — it goes out intact
// the moment the device reconnects. That is the behaviour we want, but the
// screen gave no sign of it: the button just said "Submitting…" and sat
// there, which reads as a hang. `mutation.isPaused` is the exact signal for
// "queued, waiting for a connection", so say so where the person is looking.

/**
 * The line that explains the parked button. Render it in the same footer as
 * the submit button, guarded by the mutation's own `isPaused`.
 */
export function QueuedWriteNotice() {
  const t = useTranslations("common");

  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name="cloud-offline-outline" size={15} tone="muted" />
      <AppText variant="small" tone="muted">
        {t("youReOfflineThisWillSend")}
      </AppText>
    </View>
  );
}
