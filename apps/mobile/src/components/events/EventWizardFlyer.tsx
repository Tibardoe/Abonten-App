import type { EventWizard } from "@/features/events/useEventWizard";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { View } from "react-native";

// Step 1 (first) of the event wizard — pick the flyer. Mirrors the web
// EventUploadModal flyer-first flow (expo-image-picker's editor gives the
// 4:5 crop the web ImageCropper does). The section title/subtitle is drawn
// by the wizard screen.
export function EventWizardFlyer({ w }: { w: EventWizard }) {
  return (
    <View className="gap-4">
      {w.flyerUri ? (
        <Image
          source={{ uri: w.flyerUri }}
          style={{ width: "100%", aspectRatio: 4 / 5, borderRadius: 12 }}
          contentFit="cover"
        />
      ) : (
        <View className="aspect-[4/5] w-full items-center justify-center rounded-xl border border-border border-dashed bg-muted">
          <Icon name="image-outline" size={28} tone="muted" />
          <AppText className="mt-2 text-[12px] text-muted-foreground">
            No flyer yet
          </AppText>
        </View>
      )}
      <Button
        title={w.flyerUri ? "Replace flyer" : "Choose flyer"}
        variant="outline"
        onPress={w.pickFlyer}
      />
    </View>
  );
}
