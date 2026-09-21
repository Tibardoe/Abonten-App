import { MediaStatusBar } from "@/components/app/MediaStatusBar";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { SpotlightCard } from "@/components/content/SpotlightCard";
import {
  setSpotlightMuted,
  useSpotlightMuted,
} from "@/features/content/playback/spotlightSound";
import { useContentPost } from "@/features/content/useContent";
import { flushContentViews } from "@/features/content/useContentTelemetry";
import { useVolumeKeys } from "@/features/content/useVolumeKeys";
import { useQueryView } from "@/lib/useQueryView";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// One Spotlight opened from a shared link, a notification or a profile grid.
// The page is the same SpotlightCard as the feed, always "active" here; its
// video owns its own player (SpotlightVideo) and the sound follows the
// app-wide Spotlight preference, so muting here is muting in the feed too.
export default function SpotlightPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const query = useContentPost(id);
  const [height, setHeight] = useState(0);
  const muted = useSpotlightMuted();

  const res = query.data;
  const post =
    res && res.status === 200 && res.data && "post" in res.data
      ? res.data.post
      : null;

  useEffect(() => () => void flushContentViews(), []);
  useVolumeKeys(isFocused, muted, setSpotlightMuted);

  const back = () =>
    router.canGoBack()
      ? router.back()
      : router.replace("/(app)/(tabs)/spotlight");

  // No answer yet: loading, offline or a failed request (useQueryView). An
  // answer without a post (404, removed) is the "isn't available" state.
  const view = useQueryView(query);
  const unanswered = !res && view.kind !== "content";

  return (
    <View
      className="flex-1 bg-black"
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <MediaStatusBar />
      {unanswered && view.kind === "loading" ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#fff" />
        </View>
      ) : unanswered ? (
        <QueryUnavailable
          view={view}
          subject="this Spotlight"
          onRetry={() => query.refetch()}
          onMedia
        />
      ) : !post || post.kind !== "spotlight" ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <AppText className="text-center text-[18px] font-semibold text-white">
            This Spotlight isn't available
          </AppText>
          <AppText className="text-center text-white/70">
            {(res && "message" in res && res.message) ||
              "It may have been removed."}
          </AppText>
          <Button
            title="More Spotlights"
            onPress={() => router.replace("/(app)/(tabs)/spotlight")}
          />
        </View>
      ) : height > 0 ? (
        <SpotlightCard
          item={{ post, sponsored: null }}
          mode="active"
          screenFocused={isFocused}
          height={height}
          surface="deep_link"
          onHide={back}
          topInset={insets.top + 48}
          bottomInset={insets.bottom + 22}
        />
      ) : null}

      <Pressable
        onPress={back}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={{ position: "absolute", top: insets.top + 4, left: 8 }}
        className="h-10 w-10 items-center justify-center"
      >
        <Icon name="arrow-back" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}
