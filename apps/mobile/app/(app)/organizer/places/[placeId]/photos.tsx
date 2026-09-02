import {
  useAddPlacePhoto,
  usePlaceManageContext,
  useRemovePlacePhoto,
  useReorderPlacePhotos,
} from "@/features/organizer/useManagePlace";
import type { PlacePhotoRow } from "@abonten/api-client";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";

export default function PlacePhotosScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const id = placeId ?? "";
  const q = usePlaceManageContext(id);
  const addPhoto = useAddPlacePhoto(id);
  const reorder = useReorderPlacePhotos(id);
  const remove = useRemovePlacePhoto(id);

  const serverPhotos: PlacePhotoRow[] =
    q.data && q.data.status === 200 ? q.data.data.photos : [];

  // Local order for snappy ◀ ▶ moves; re-synced whenever the server list
  // changes (add / remove / a reorder settling).
  const [order, setOrder] = useState<PlacePhotoRow[]>(serverPhotos);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-sync on server list identity/shape change.
  useEffect(() => {
    setOrder(serverPhotos);
  }, [q.data]);

  const busy = addPhoto.isPending || reorder.isPending || remove.isPending;

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
          setOrder(serverPhotos);
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

  if (q.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (q.isError || (q.data && q.data.status !== 200)) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <AppText className="text-center text-muted-foreground">
          {(q.data && q.data.status === 403 && q.data.message) ||
            "Couldn't load this place's photos."}
        </AppText>
        <Pressable
          className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
          onPress={() => q.refetch()}
        >
          <AppText className="font-semibold text-primary-foreground">
            Retry
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-16"
    >
      <AppText className="text-xl font-bold text-foreground">
        Gallery photos
      </AppText>

      <Button
        title={addPhoto.isPending ? "Uploading…" : "Add photos"}
        variant="outline"
        loading={addPhoto.isPending}
        disabled={busy}
        onPress={pickAndAdd}
      />

      {order.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">
          No gallery photos yet.
        </AppText>
      ) : (
        <View className="flex-row flex-wrap gap-3">
          {order.map((photo, index) => (
            <View key={photo.id} className="w-[47%] gap-1">
              <Image
                source={{
                  uri: buildCloudinaryUrl(photo.public_id, photo.version, {
                    width: 400,
                    height: 400,
                  }),
                }}
                style={{ width: "100%", aspectRatio: 1, borderRadius: 10 }}
                contentFit="cover"
                transition={150}
              />
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
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
