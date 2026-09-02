import { AppText } from "@abonten/ui-native";
import { View } from "react-native";

// The centered status wash on a discovery card's cover image — the native
// echo of EventCard's `centerOverlay` (canceled / sold out / ongoing /
// ended). Non-interactive so the card underneath stays tappable; scoped to
// the image, never the whole card.

export function CardStatusOverlay({
  label,
  canceled = false,
}: {
  label: string;
  canceled?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 items-center justify-center p-4"
      style={{
        backgroundColor: canceled ? "rgba(127,29,29,0.8)" : "rgba(0,0,0,0.65)",
      }}
    >
      <AppText variant="sectionTitle" tone="inverse" className="text-center">
        {label}
      </AppText>
    </View>
  );
}
