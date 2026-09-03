import {
  MAX_WIZARD_GALLERY_PHOTOS,
  type PlaceWizard,
} from "@/features/places/usePlaceWizard";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { Pressable, View } from "react-native";

// Step 2 (optional) of the place wizard — stage extra gallery photos. They
// upload only after the place is published (w.uploadStagedPhotos), so a
// failed photo can never block place creation. The owner can add / reorder /
// remove more later from Edit Place. Mirrors the intent of the web create
// flow's photo step; the section title/subtitle is drawn by the wizard
// screen.
export function PlaceWizardPhotos({ w }: { w: PlaceWizard }) {
  const photos = w.photoUris;
  const full = photos.length >= MAX_WIZARD_GALLERY_PHOTOS;

  return (
    <View className="gap-4">
      {photos.length === 0 ? (
        <View className="items-center gap-2 rounded-xl border border-border border-dashed bg-muted px-4 py-8">
          <Icon name="images-outline" size={28} tone="muted" />
          <AppText variant="meta" className="text-center">
            Optional — add a few photos of the space, menu or crowd.
          </AppText>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {photos.map((uri) => (
            <View key={uri} className="relative">
              <Image
                source={{ uri }}
                style={{ width: 104, height: 104, borderRadius: 10 }}
                contentFit="cover"
              />
              <Pressable
                onPress={() => w.removeGalleryPhoto(uri)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/70"
              >
                <Icon name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Button
        title={
          photos.length === 0
            ? "Add photos"
            : full
              ? `Maximum ${MAX_WIZARD_GALLERY_PHOTOS} photos`
              : `Add more (${photos.length}/${MAX_WIZARD_GALLERY_PHOTOS})`
        }
        variant="outline"
        onPress={w.pickGalleryPhotos}
        disabled={full}
      />
    </View>
  );
}
