import { ImageCropModal } from "@/components/profile/ImageCropModal";
import type { EventWizard } from "@/features/events/useEventWizard";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";

const FLYER_ASPECT = 4 / 5;
const isLocal = (uri: string | null): boolean =>
  !!uri && !/^https?:/i.test(uri);

// Step 1 (first) of the event wizard — pick the flyer, then crop / rotate /
// flip it in the in-app editor (ImageCropModal), locked to the 4:5 shape
// every flyer surface expects. Mirrors the web EventUploadModal's
// ImageCropper step. The section title/subtitle is drawn by the wizard
// screen.
export function EventWizardFlyer({ w }: { w: EventWizard }) {
  const [editing, setEditing] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);

  async function choose() {
    const picked = await w.pickFlyer();
    if (picked) setEditing(picked);
  }

  function editCurrent() {
    if (w.flyerUri && w.flyerSize) {
      setEditing({
        uri: w.flyerUri,
        width: w.flyerSize.w,
        height: w.flyerSize.h,
      });
    }
  }

  return (
    <View className="gap-4">
      {w.flyerUri ? (
        <Image
          source={{ uri: w.flyerUri }}
          style={{ width: "100%", aspectRatio: FLYER_ASPECT, borderRadius: 12 }}
          contentFit="cover"
        />
      ) : (
        <View className="aspect-[4/5] w-full items-center justify-center rounded-xl border border-border border-dashed bg-muted">
          <Icon name="image-outline" size={28} tone="muted" />
          <AppText variant="meta" className="mt-2">
            No flyer yet
          </AppText>
        </View>
      )}

      <View className="gap-2">
        <Button
          title={w.flyerUri ? "Replace flyer" : "Choose flyer"}
          variant="outline"
          onPress={choose}
        />
        {w.flyerUri && isLocal(w.flyerUri) && w.flyerSize ? (
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
          lockedAspect={FLYER_ASPECT}
          onCancel={() => setEditing(null)}
          onDone={(r) => {
            w.setFlyer(r.uri, r.width, r.height);
            setEditing(null);
          }}
        />
      ) : null}
    </View>
  );
}
