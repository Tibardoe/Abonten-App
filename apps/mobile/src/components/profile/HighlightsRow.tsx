import { PostHighlightSheet } from "@/components/profile/PostHighlightSheet";
import {
  type HighlightMediaPick,
  MAX_HIGHLIGHT_IMAGE_BYTES,
  MAX_HIGHLIGHT_VIDEO_BYTES,
  MAX_HIGHLIGHT_VIDEO_SECONDS,
  useDeleteHighlightGroup,
  useHighlights,
} from "@/features/profile/useHighlights";
import { Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { HighlightViewer } from "./HighlightViewer";

// Native echo of the web `UserHighlights` row: a horizontal strip of circular
// highlight covers (mint ring). Tapping one opens the story-style
// `HighlightViewer`. On your own profile the strip also has an "add" circle
// (pick images/videos → PostHighlightSheet review + upload) and a long-press
// on a cover deletes that whole group — creator tooling mirroring the web
// `HighlightModal` + `HighlightMenu`.

export function HighlightsRow({
  userId,
  username,
  isOwn = false,
}: {
  userId: string;
  username: string;
  isOwn?: boolean;
}) {
  const { data: groups } = useHighlights(userId);
  const deleteGroup = useDeleteHighlightGroup(userId);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [pendingMedia, setPendingMedia] = useState<HighlightMediaPick[] | null>(
    null,
  );

  const hasGroups = !!groups && groups.length > 0;
  if (!hasGroups && !isOwn) return null;

  async function pickMedia() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to add highlights.",
      );
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.length) return;

    const media: HighlightMediaPick[] = [];
    for (const asset of picked.assets) {
      const isVideo = asset.type === "video";
      const maxBytes = isVideo
        ? MAX_HIGHLIGHT_VIDEO_BYTES
        : MAX_HIGHLIGHT_IMAGE_BYTES;
      if (typeof asset.fileSize === "number" && asset.fileSize > maxBytes) {
        Alert.alert(
          "File too large",
          `${isVideo ? "Videos" : "Images"} must be ${Math.round(
            maxBytes / (1024 * 1024),
          )}MB or smaller.`,
        );
        return;
      }
      const durationSeconds =
        isVideo && typeof asset.duration === "number"
          ? asset.duration / 1000
          : null;
      if (
        durationSeconds &&
        durationSeconds > MAX_HIGHLIGHT_VIDEO_SECONDS + 1
      ) {
        Alert.alert(
          "Video too long",
          `Highlight videos must be ${MAX_HIGHLIGHT_VIDEO_SECONDS} seconds or shorter. Trim it on the Abonten website first.`,
        );
        return;
      }
      media.push({
        uri: asset.uri,
        type: isVideo ? "video" : "image",
        durationSeconds,
      });
    }

    setPendingMedia(media);
  }

  function confirmDeleteGroup(groupId: string) {
    Alert.alert("Delete highlight?", "This removes every slide in it.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteGroup.mutate(groupId, {
            onError: (e) =>
              Alert.alert(
                "Couldn't delete",
                e instanceof Error ? e.message : "Please try again.",
              ),
          }),
      },
    ]);
  }

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 py-1"
      >
        {isOwn ? (
          <Pressable
            onPress={pickMedia}
            className="items-center justify-center active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Add highlight"
          >
            <View className="h-[68px] w-[68px] items-center justify-center rounded-full border-2 border-dashed border-border">
              <Icon name="add" size={26} tone="muted" />
            </View>
          </Pressable>
        ) : null}

        {(groups ?? []).map((group, index) => {
          const cover = group[group.length - 1];
          const thumb =
            cover.media_type === "video"
              ? (cover.thumbnail_url ?? cover.media_url)
              : cover.media_url;
          return (
            <Pressable
              key={cover.group_id}
              onPress={() => setOpenIndex(index)}
              onLongPress={
                isOwn ? () => confirmDeleteGroup(cover.group_id) : undefined
              }
              className="items-center active:opacity-80"
            >
              <View className="rounded-full border-2 border-mint p-0.5">
                <Image
                  source={{ uri: thumb }}
                  style={{ width: 64, height: 64, borderRadius: 32 }}
                  contentFit="cover"
                />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {openIndex !== null && groups ? (
        <HighlightViewer
          groups={groups}
          initialGroupIndex={openIndex}
          username={username}
          canManage={isOwn}
          userId={userId}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}

      {pendingMedia ? (
        <PostHighlightSheet
          open
          media={pendingMedia}
          userId={userId}
          onClose={() => setPendingMedia(null)}
          onPosted={() => setPendingMedia(null)}
        />
      ) : null}
    </View>
  );
}
