import { MediaViewer, type MediaViewerItem } from "@/components/MediaViewer";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

// A review's attached photos (event_review_photo / place_review_photo,
// selected as id/public_id/version/position) shown as a horizontal
// thumbnail strip; tap one to open the shared full-screen MediaViewer
// (pinch-zoom, swipe, drag-to-dismiss, safe areas, loading/error states).

export type ReviewPhoto = {
  id: string;
  public_id: string;
  version: string;
  position: number;
};

export function ReviewPhotoStrip({
  photos,
}: {
  photos: ReviewPhoto[] | null | undefined;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const sorted = useMemo(
    () => [...(photos ?? [])].sort((a, b) => a.position - b.position),
    [photos],
  );

  const items = useMemo<MediaViewerItem[]>(
    () =>
      sorted.map((p) => ({
        id: p.id,
        uri: buildCloudinaryUrl(p.public_id, p.version, { width: 1600 }),
        thumbUri: buildCloudinaryUrl(p.public_id, p.version, {
          width: 160,
          height: 160,
        }),
      })),
    [sorted],
  );

  if (sorted.length === 0) return null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 py-1"
      >
        {sorted.map((photo, index) => (
          <Pressable
            key={photo.id}
            onPress={() => setOpenIndex(index)}
            accessibilityRole="button"
            accessibilityLabel="View photo larger"
          >
            <Image
              source={{
                uri: buildCloudinaryUrl(photo.public_id, photo.version, {
                  width: 160,
                  height: 160,
                }),
              }}
              style={{ width: 76, height: 76, borderRadius: 8 }}
              contentFit="cover"
            />
          </Pressable>
        ))}
      </ScrollView>

      <MediaViewer
        items={items}
        index={openIndex ?? 0}
        open={openIndex !== null}
        onClose={() => setOpenIndex(null)}
      />
    </View>
  );
}
