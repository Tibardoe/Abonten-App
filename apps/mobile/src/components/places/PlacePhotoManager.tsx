import {
  useAddPlacePhoto,
  useRemovePlacePhoto,
  useReorderPlacePhotos,
  useSetPlaceCover,
} from "@/features/organizer/useManagePlace";
import type { PlacePhotoRow } from "@abonten/api-client";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";

// The gallery editor shared by the standalone "Gallery photos" screen and
// the Photos section of Edit Place: add (multi-pick → Cloudinary → record),
// reorder (◀ ▶), remove, and promote a photo to the place cover. Ownership
// is enforced server-side by every mutation.

export function PlacePhotoManager({
  placeId,
  photos,
  currentCoverPublicId,
}: {
  placeId: string;
  photos: PlacePhotoRow[];
  currentCoverPublicId?: string | null;
}) {
  const addPhoto = useAddPlacePhoto(placeId);
  const reorder = useReorderPlacePhotos(placeId);
  const remove = useRemovePlacePhoto(placeId);
  const setCover = useSetPlaceCover(placeId);

  // Local order for snappy ◀ ▶ moves; re-synced whenever the server list
  // identity changes (add / remove / reorder settling).
  const [order, setOrder] = useState<PlacePhotoRow[]>(photos);
  useEffect(() => {
    setOrder(photos);
  }, [photos]);

  const busy =
    addPhoto.isPending ||
    reorder.isPending ||
    remove.isPending ||
    setCover.isPending;

  async function pickAndAdd() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to add gallery photos.",
      );
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.length) return;

    for (const asset of picked.assets) {
      try {
        const res = await addPhoto.mutateAsync(asset.uri);
        if (res.status !== 200) {
          Alert.alert("Couldn't add a photo", res.message);
          break;
        }
      } catch {
        Alert.alert("Upload failed", "Please try again.");
        break;
      }
    }
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setOrder(next);
    reorder.mutate(
      next.map((p) => p.id),
      {
        onError: () => {
          setOrder(photos);
          Alert.alert("Couldn't reorder", "Please try again.");
        },
      },
    );
  }

  function confirmRemove(photo: PlacePhotoRow) {
    Alert.alert(
      "Remove this photo?",
      "It will be removed from your gallery. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            remove.mutate(photo.id, {
              onSuccess: (res) => {
                if (res.status !== 200)
                  Alert.alert("Couldn't remove", res.message);
              },
              onError: () =>
                Alert.alert("Couldn't remove", "Please try again."),
            }),
        },
      ],
    );
  }

  function onSetCover(photo: PlacePhotoRow) {
    setCover.mutate(photo.id, {
      onSuccess: (res) => {
        if (res.status !== 200) Alert.alert("Couldn't set cover", res.message);
      },
      onError: () => Alert.alert("Couldn't set cover", "Please try again."),
    });
  }

  return (
    <View className="gap-3">
      <Button
        title={addPhoto.isPending ? "Uploading…" : "Add photos"}
        variant="outline"
        loading={addPhoto.isPending}
        disabled={busy}
        onPress={pickAndAdd}
      />

      {order.length === 0 ? (
        <AppText variant="meta">No gallery photos yet.</AppText>
      ) : (
        <View className="flex-row flex-wrap gap-3">
          {order.map((photo, index) => {
            const isCover =
              !!currentCoverPublicId &&
              photo.public_id === currentCoverPublicId;
            return (
              <View key={photo.id} className="w-[47%] gap-1.5">
                <View>
                  <Image
                    source={{
                      uri: buildCloudinaryUrl(photo.public_id, photo.version, {
                        width: 400,
                        height: 400,
                      }),
                    }}
                    style={{
                      width: "100%",
                      aspectRatio: 1,
                      borderRadius: 10,
                    }}
                    contentFit="cover"
                    transition={150}
                  />
                  {isCover ? (
                    <View className="absolute left-1.5 top-1.5 flex-row items-center gap-1 rounded-full bg-primary px-2 py-0.5">
                      <Icon name="star" size={11} tone="inverse" />
                      <AppText
                        variant="caption"
                        className="font-semibold text-primary-foreground"
                      >
                        Cover
                      </AppText>
                    </View>
                  ) : null}
                </View>

                <View className="flex-row items-center justify-between">
                  <View className="flex-row">
                    <Pressable
                      onPress={() => move(index, -1)}
                      disabled={index === 0 || busy}
                      className="p-1 active:opacity-60 disabled:opacity-30"
                    >
                      <Icon name="arrow-back" size={18} tone="muted" />
                    </Pressable>
                    <Pressable
                      onPress={() => move(index, 1)}
                      disabled={index === order.length - 1 || busy}
                      className="p-1 active:opacity-60 disabled:opacity-30"
                    >
                      <Icon name="arrow-forward" size={18} tone="muted" />
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => confirmRemove(photo)}
                    disabled={busy}
                    className="p-1 active:opacity-60 disabled:opacity-30"
                  >
                    <Icon name="trash-outline" size={18} tone="destructive" />
                  </Pressable>
                </View>

                {!isCover ? (
                  <Pressable
                    onPress={() => onSetCover(photo)}
                    disabled={busy}
                    className="active:opacity-60 disabled:opacity-40"
                  >
                    <AppText
                      variant="caption"
                      tone="brand"
                      className="font-semibold"
                    >
                      Set as cover
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
