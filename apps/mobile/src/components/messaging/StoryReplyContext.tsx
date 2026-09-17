import {
  readStoryReplyContext,
  storyReplyLabel,
  storyReplyStoryLive,
} from "@abonten/core/content/storyReply";
import { AppText, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { memo } from "react";
import { Pressable, View } from "react-native";

// The Story a message answers, shown above its bubble: "Replied to your
// story" plus a small preview that opens the Story while it is still up.
// Once the Story has ended (Stories last a day) the preview becomes a quiet
// placeholder — the reply keeps its context without linking to nothing.
export const StoryReplyContext = memo(function StoryReplyContext({
  systemData,
  isMine,
}: {
  systemData: Record<string, unknown> | null | undefined;
  isMine: boolean;
}) {
  const router = useRouter();
  const ctx = readStoryReplyContext(systemData);
  if (!ctx) return null;
  const live = storyReplyStoryLive(ctx);
  const label = storyReplyLabel(ctx, isMine);

  return (
    <View
      className={`mb-1 gap-1 ${isMine ? "items-end" : "items-start"}`}
      accessible={!live}
      accessibilityLabel={live ? undefined : `${label}. The story has ended.`}
    >
      <AppText variant="caption" tone="muted" className="px-1">
        {label}
      </AppText>
      {live && ctx.thumbnailUrl ? (
        <Pressable
          onPress={() => router.push(`/(app)/story/${ctx.postId}`)}
          accessibilityRole="button"
          accessibilityLabel={`${label}. Open the story`}
          className="h-[104px] w-[64px] overflow-hidden rounded-xl bg-muted active:opacity-80"
        >
          <Image
            source={{ uri: ctx.thumbnailUrl }}
            style={{ flex: 1 }}
            contentFit="cover"
            recyclingKey={ctx.postId}
          />
          {ctx.mediaType === "video" ? (
            <View className="absolute bottom-1.5 left-1.5">
              <Icon name="play" size={12} color="#fff" />
            </View>
          ) : null}
        </Pressable>
      ) : (
        <View className="h-[52px] w-[64px] items-center justify-center rounded-xl border border-dashed border-border px-1">
          <Icon name="time-outline" size={16} tone="muted" />
          <AppText
            variant="caption"
            tone="muted"
            className="text-center text-[10px] leading-3"
          >
            Story ended
          </AppText>
        </View>
      )}
    </View>
  );
});
