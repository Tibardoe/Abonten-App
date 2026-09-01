import { useHighlights } from "@/features/profile/useHighlights";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { HighlightViewer } from "./HighlightViewer";

// Native echo of the web `UserHighlights` row: a horizontal strip of circular
// highlight covers (mint ring, like the web `border-mint`). Tapping one opens
// the story-style `HighlightViewer` at that group. Owner add/delete is
// creator tooling handled elsewhere — this is the visitor-facing view.

export function HighlightsRow({
  userId,
  username,
}: {
  userId: string;
  username: string;
}) {
  const { data: groups } = useHighlights(userId);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!groups || groups.length === 0) return null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 py-1"
      >
        {groups.map((group, index) => {
          const cover = group[group.length - 1];
          const thumb =
            cover.media_type === "video"
              ? (cover.thumbnail_url ?? cover.media_url)
              : cover.media_url;
          return (
            <Pressable
              key={cover.group_id}
              onPress={() => setOpenIndex(index)}
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

      {openIndex !== null ? (
        <HighlightViewer
          groups={groups}
          initialGroupIndex={openIndex}
          username={username}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </View>
  );
}
