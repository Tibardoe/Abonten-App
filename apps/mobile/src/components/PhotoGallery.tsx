import { MediaViewer, type MediaViewerItem } from "@/components/MediaViewer";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

// A horizontal thumbnail strip that opens the shared full-screen
// MediaViewer (pinch-zoom, swipe, drag-to-dismiss, safe areas,
// loading/error states). Used for place galleries (place_photo). Takes
// Cloudinary id/version pairs already in display order.

export type GalleryPhoto = { id: string; public_id: string; version: string };

export function PhotoGallery({
  photos,
  thumbSize = 96,
}: {
  photos: GalleryPhoto[] | null | undefined;
  thumbSize?: number;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const list = photos ?? [];

  const items = useMemo<MediaViewerItem[]>(
    () =>
      list.map((p) => ({
        id: p.id,
        uri: buildCloudinaryUrl(p.public_id, p.version, { width: 1600 }),
        thumbUri: buildCloudinaryUrl(p.public_id, p.version, {
          width: thumbSize * 2,
          height: thumbSize * 2,
        }),
      })),
    [list, thumbSize],
  );

  if (list.length === 0) return null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 py-1"
      >
        {list.map((photo, index) => (
          <Pressable
            key={photo.id}
            onPress={() => setOpenIndex(index)}
            accessibilityRole="button"
            accessibilityLabel="View photo larger"
          >
            <Image
              source={{
                uri: buildCloudinaryUrl(photo.public_id, photo.version, {
                  width: thumbSize * 2,
                  height: thumbSize * 2,
                }),
              }}
              style={{ width: thumbSize, height: thumbSize, borderRadius: 10 }}
              contentFit="cover"
              transition={150}
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
