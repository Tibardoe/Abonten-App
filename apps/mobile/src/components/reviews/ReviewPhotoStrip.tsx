import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";

// Native echo of the web ReviewPhotoGrid + ReviewPhotoLightbox: a review's
// attached photos (event_review_photo, selected as id/public_id/version/
// position) shown as a horizontal thumbnail strip; tap one to page through
// them full-screen. One component so review-photo display stays in a single
// place, same as the web grid.

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
  const { width, height } = useWindowDimensions();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!photos || photos.length === 0) return null;

  const sorted = [...photos].sort((a, b) => a.position - b.position);
  const active = openIndex !== null ? sorted[openIndex] : null;

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

      {active ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setOpenIndex(null)}
        >
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            <Image
              source={{
                uri: buildCloudinaryUrl(active.public_id, active.version, {
                  width: 1200,
                }),
              }}
              style={{ position: "absolute", width, height }}
              contentFit="contain"
              transition={120}
            />

            <View
              className="absolute left-0 right-0 flex-row items-center justify-between px-4"
              style={{ top: 24 }}
            >
              <View className="rounded-full bg-black/60 px-3 py-1">
                <Icon name="images-outline" size={16} color="#fff" />
              </View>
              <Pressable onPress={() => setOpenIndex(null)} hitSlop={12}>
                <Icon name="close" size={26} color="#fff" />
              </Pressable>
            </View>

            {openIndex !== null && openIndex > 0 ? (
              <Pressable
                onPress={() => setOpenIndex(openIndex - 1)}
                className="absolute left-2 top-1/2 rounded-full bg-black/50 p-2"
                hitSlop={12}
              >
                <Icon name="chevron-back" size={26} color="#fff" />
              </Pressable>
            ) : null}
            {openIndex !== null && openIndex < sorted.length - 1 ? (
              <Pressable
                onPress={() => setOpenIndex(openIndex + 1)}
                className="absolute right-2 top-1/2 rounded-full bg-black/50 p-2"
                hitSlop={12}
              >
                <Icon name="chevron-forward" size={26} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
