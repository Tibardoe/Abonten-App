import { HighlightUploadStatus } from "@/components/profile/HighlightUploadStatus";
import { useHighlightUpload } from "@/features/profile/HighlightUploadProvider";
import {
  useDeleteHighlightGroup,
  useHighlights,
} from "@/features/profile/useHighlights";
import { Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { HighlightViewer } from "./HighlightViewer";

// Native echo of the web `UserHighlights` row: a horizontal strip of circular
// highlight covers (mint ring). Tapping one opens the story-style
// `HighlightViewer`. On your own profile the strip also has an "add" circle
// that opens the full-screen composer (`/highlight/new` — pick, crop, trim,
// post) and a long-press on a cover deletes that whole group — creator
// tooling mirroring the web `HighlightModal` + `HighlightMenu`.

export function HighlightsRow({
  userId,
  username,
  isOwn = false,
  avatarPublicId,
  avatarVersion,
}: {
  userId: string;
  username: string;
  isOwn?: boolean;
  avatarPublicId?: string | null;
  avatarVersion?: number | string | null;
}) {
  const router = useRouter();
  const { data: groups } = useHighlights(userId);
  const deleteGroup = useDeleteHighlightGroup(userId);
  const { isUploading } = useHighlightUpload();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const hasGroups = !!groups && groups.length > 0;
  if (!hasGroups && !isOwn) return null;

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
      {isOwn ? <HighlightUploadStatus /> : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 py-1"
      >
        {isOwn ? (
          <Pressable
            onPress={() => router.push("/(app)/highlight/new")}
            disabled={isUploading}
            className="items-center justify-center active:opacity-80"
            style={{ opacity: isUploading ? 0.4 : 1 }}
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
          avatarPublicId={avatarPublicId}
          avatarVersion={avatarVersion}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </View>
  );
}
