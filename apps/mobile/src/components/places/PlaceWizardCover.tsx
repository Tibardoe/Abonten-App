import type { PlaceWizard } from "@/features/places/usePlaceWizard";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { View } from "react-native";

// Step 1 (first) of the place wizard — pick the cover photo. Mirrors the web
// PlaceCreateStepPhotos (expo-image-picker's built-in editor gives the
// 16:9 crop the web ImageCropper does). The section title/subtitle is drawn
// by the wizard screen.
export function PlaceWizardCover({ w }: { w: PlaceWizard }) {
  return (
    <View className="gap-4">
      {w.coverUri ? (
        <Image
          source={{ uri: w.coverUri }}
          style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12 }}
          contentFit="cover"
        />
      ) : (
        <View className="aspect-[16/9] w-full items-center justify-center rounded-xl border border-border border-dashed bg-muted">
          <Icon name="image-outline" size={28} tone="muted" />
          <AppText className="mt-2 text-[12px] text-muted-foreground">
            No photo yet
          </AppText>
        </View>
      )}
      <Button
        title={w.coverUri ? "Replace photo" : "Choose photo"}
        variant="outline"
        onPress={w.pickCover}
      />
    </View>
  );
}
