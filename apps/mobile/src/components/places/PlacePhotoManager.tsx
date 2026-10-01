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
import { useTranslations } from "@abonten/ui-native/i18n";
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
  const t = useTranslations("places");

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
      toast.error(t("photoAccessNeeded"), {
        description: t("allowPhotoAccessToAddGallery"),
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
            toast.error(res.message ?? t("weCouldnTAddThatPhoto"), {
              description:
                added > 0
                  ? t("ofWereAddedTryTheRest", { added: added, total: total })
                  : t("nothingWasAddedPleaseTryAgain"),
            });
            return;
          }
          added += 1;
        } catch {
          toast.error(t("thatUploadDidnTFinish"), {
            description: t("checkYourConnectionAndTryAgain"),
          });
          return;
        }
      }
      toast.success(
        added === 1 ? t("photoAdded") : t("photosAdded", { added: added }),
      );
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
          toast.error(t("weCouldnTSaveTheNew"), {
            description: t("theGalleryHasBeenPutBack"),
          });
        },
      },
    );
  }

  function confirmRemove(photo: PlacePhotoRow) {
    Alert.alert(t("removeThisPhoto"), t("itWillBeRemovedFromYour"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("remove2"),
        style: "destructive",
        onPress: () =>
          remove.mutate(photo.id, {
            onSuccess: (res) => {
              if (res.status === 200) {
                toast.success(t("photoRemoved"));
                return;
              }
              toast.error(res.message ?? t("weCouldnTRemoveThatPhoto"), {
                description: t("itIsStillInYourGallery"),
              });
            },
            onError: () =>
              toast.error(t("weCouldnTReachTheServer"), {
                description: t("checkYourConnectionAndTryAgain"),
              }),
          }),
      },
    ]);
  }

  function onSetCover(photo: PlacePhotoRow) {
    setCover.mutate(photo.id, {
      onSuccess: (res) => {
        if (res.status === 200) {
          toast.success(t("coverPhotoUpdated"));
          return;
        }
        toast.error(res.message ?? t("weCouldnTSetThatAs"), {
          description: t("yourCoverIsUnchangedPleaseTry"),
        });
      },
      onError: () =>
        toast.error(t("weCouldnTReachTheServer"), {
          description: t("checkYourConnectionAndTryAgain"),
        }),
    });
  }

  return (
    <View className="gap-3">
      <Button
        title={t("addPhotos")}
        loadingTitle={t("uploading")}
        variant="outline"
        loading={addPhoto.isPending}
        disabled={busy}
        onPress={pickAndAdd}
      />

      <UploadProgress state={progress} what="photos" />

      {order.length === 0 ? (
        <EmptyState
          icon="images-outline"
          title={t("noGalleryPhotosYet2")}
          description={t("photosOfTheSpaceAreWhat")}
          actionLabel={t("addPhotos")}
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
                        {t("cover")}
                      </AppText>
                    </View>
                  ) : null}
                </View>

                <View className="flex-row items-center justify-between">
                  <View className="flex-row">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => move(index, -1)}
                      disabled={index === 0 || busy}
                      className="p-1 active:opacity-60 disabled:opacity-30"
                    >
                      <Icon name="arrow-back" size={18} tone="muted" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => move(index, 1)}
                      disabled={index === order.length - 1 || busy}
                      className="p-1 active:opacity-60 disabled:opacity-30"
                    >
                      <Icon name="arrow-forward" size={18} tone="muted" />
                    </Pressable>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => confirmRemove(photo)}
                    disabled={busy}
                    className="p-1 active:opacity-60 disabled:opacity-30"
                  >
                    <Icon name="trash-outline" size={18} tone="destructive" />
                  </Pressable>
                </View>

                {!isCover ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onSetCover(photo)}
                    disabled={busy}
                    className="active:opacity-60 disabled:opacity-40"
                  >
                    <AppText
                      variant="caption"
                      tone="brand"
                      className="font-semibold"
                    >
                      {t("setAsCover")}
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
