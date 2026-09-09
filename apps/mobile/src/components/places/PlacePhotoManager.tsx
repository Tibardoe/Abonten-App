import { UploadProgress } from "@/components/UploadProgress";
import {
  useAddPlacePhoto,
  useRemovePlacePhoto,
  useReorderPlacePhotos,
  useSetPlaceCover,
} from "@/features/organizer/useManagePlace";
import { useUploadProgress } from "@/features/uploads/useUploadProgress";
import type { PlacePhotoRow } from "@abonten/api-client";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import {
  AppText,
  Button,
  EmptyState,
  Icon,
  useToast,
} from "@abonten/ui-native";
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
  const toast = useToast();
  const addPhoto = useAddPlacePhoto(placeId);
  const reorder = useReorderPlacePhotos(placeId);
  const remove = useRemovePlacePhoto(placeId);
  const setCover = useSetPlaceCover(placeId);
  const progress = useUploadProgress();

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
      toast.error("Photo access needed", {
        description: "Allow photo access to add gallery photos.",
      });
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.length) return;

    // Photo-by-photo, with a real bar: a gallery upload on a slow
    // connection used to be a completely silent multi-minute wait.
    const total = picked.assets.length;
    let added = 0;
    progress.start();
    try {
      for (const [i, asset] of picked.assets.entries()) {
        try {
          const res = await addPhoto.mutateAsync({
            uri: asset.uri,
            onProgress: (f) => progress.onProgress((i + f) / total),
          });
          if (res.status !== 200) {
            toast.error(res.message ?? "We couldn't add that photo.", {
              description:
                added > 0
                  ? `${added} of ${total} were added. Try the rest again.`
                  : "Nothing was added. Please try again.",
            });
            return;
          }
          added += 1;
        } catch {
          toast.error("That upload didn't finish.", {
            description: "Check your connection and try again.",
          });
          return;
        }
      }
      toast.success(added === 1 ? "Photo added" : `${added} photos added`);
    } finally {
      progress.reset();
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
          toast.error("We couldn't save the new order.", {
            description: "The gallery has been put back as it was.",
          });
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
                if (res.status === 200) {
                  toast.success("Photo removed");
                  return;
                }
                toast.error(res.message ?? "We couldn't remove that photo.", {
                  description: "It is still in your gallery. Try again.",
                });
              },
              onError: () =>
                toast.error("We couldn't reach the server.", {
                  description: "Check your connection and try again.",
                }),
            }),
        },
      ],
    );
  }

  function onSetCover(photo: PlacePhotoRow) {
    setCover.mutate(photo.id, {
      onSuccess: (res) => {
        if (res.status === 200) {
          toast.success("Cover photo updated");
          return;
        }
        toast.error(res.message ?? "We couldn't set that as the cover.", {
          description: "Your cover is unchanged. Please try again.",
        });
      },
      onError: () =>
        toast.error("We couldn't reach the server.", {
          description: "Check your connection and try again.",
        }),
    });
  }

  return (
    <View className="gap-3">
      <Button
        title="Add photos"
        loadingTitle="Uploading…"
        variant="outline"
        loading={addPhoto.isPending}
        disabled={busy}
        onPress={pickAndAdd}
      />

      <UploadProgress state={progress} what="photos" />

      {order.length === 0 ? (
        <EmptyState
          icon="images-outline"
          title="No gallery photos yet"
          description="Photos of the space are what make a listing worth tapping. Add a few and they show on the place page."
          actionLabel="Add photos"
          onAction={pickAndAdd}
        />
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
