import { ImageCropModal } from "@/components/profile/ImageCropModal";
import type { PlaceWizard } from "@/features/places/usePlaceWizard";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";

const COVER_ASPECT = 16 / 9;
const isLocal = (uri: string | null): boolean =>
  !!uri && !/^https?:/i.test(uri);

// Step 1 (first) of the place wizard — pick the cover photo, then crop /
// rotate / flip it in the in-app editor (ImageCropModal), locked to the
// 16:9 shape the place cover expects. Mirrors the web PlaceCreateStepPhotos
// ImageCropper step. The section title/subtitle is drawn by the wizard
// screen.
export function PlaceWizardCover({ w }: { w: PlaceWizard }) {
  const [editing, setEditing] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);

  async function choose() {
    const picked = await w.pickCover();
    if (picked) setEditing(picked);
  }

  function editCurrent() {
    if (w.coverUri && w.coverSize) {
      setEditing({
        uri: w.coverUri,
        width: w.coverSize.w,
        height: w.coverSize.h,
      });
    }
  }

  return (
    <View className="gap-4">
      {w.coverUri ? (
        <Image
          source={{ uri: w.coverUri }}
          style={{ width: "100%", aspectRatio: COVER_ASPECT, borderRadius: 12 }}
          contentFit="cover"
        />
      ) : (
        <View className="aspect-[16/9] w-full items-center justify-center rounded-xl border border-border border-dashed bg-muted">
          <Icon name="image-outline" size={28} tone="muted" />
          <AppText variant="meta" className="mt-2">
            No photo yet
          </AppText>
        </View>
      )}

      <View className="gap-2">
        <Button
          title={w.coverUri ? "Replace photo" : "Choose photo"}
          variant="outline"
          onPress={choose}
        />
        {w.coverUri && isLocal(w.coverUri) && w.coverSize ? (
          <Button
            title="Crop, rotate or flip"
            variant="ghost"
            onPress={editCurrent}
          />
        ) : null}
      </View>

      {editing ? (
        <ImageCropModal
          visible
          uri={editing.uri}
          sourceWidth={editing.width}
          sourceHeight={editing.height}
          lockedAspect={COVER_ASPECT}
          onCancel={() => setEditing(null)}
          onDone={(r) => {
            w.setCover(r.uri, r.width, r.height);
            setEditing(null);
          }}
        />
      ) : null}
    </View>
  );
}
