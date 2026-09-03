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

// A horizontal thumbnail strip that opens a full-screen, swipeable pager.
// Used for place galleries (place_photo). Takes Cloudinary id/version pairs
// already in display order — same viewer pattern as ReviewPhotoStrip, but
// without the review-photo `position` requirement.

export type GalleryPhoto = { id: string; public_id: string; version: string };

export function PhotoGallery({
  photos,
  thumbSize = 96,
}: {
  photos: GalleryPhoto[] | null | undefined;
  thumbSize?: number;
}) {
  const { width, height } = useWindowDimensions();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!photos || photos.length === 0) return null;
  const active = openIndex !== null ? photos[openIndex] : null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 py-1"
      >
        {photos.map((photo, index) => (
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

      {active ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setOpenIndex(null)}
          statusBarTranslucent
        >
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: (openIndex ?? 0) * width, y: 0 }}
            >
              {photos.map((photo) => (
                <View key={photo.id} style={{ width, height }}>
                  <Image
                    source={{
                      uri: buildCloudinaryUrl(photo.public_id, photo.version, {
                        width: 1400,
                      }),
                    }}
                    style={{ width, height }}
                    contentFit="contain"
                    transition={120}
                  />
                </View>
              ))}
            </ScrollView>

            <View
              className="absolute left-0 right-0 flex-row items-center justify-between px-4"
              style={{ top: 28 }}
            >
              <View className="rounded-full bg-black/60 px-3 py-1">
                <Icon name="images-outline" size={16} color="#fff" />
              </View>
              <Pressable
                onPress={() => setOpenIndex(null)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Icon name="close" size={26} color="#fff" />
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
