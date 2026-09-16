import { SpotlightCard } from "@/components/content/SpotlightCard";
import { useContentPost } from "@/features/content/useContent";
import { flushContentViews } from "@/features/content/useContentTelemetry";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StatusBar, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// One Spotlight opened from a shared link, a notification or a profile grid.
export default function SpotlightPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const query = useContentPost(id);
  const [height, setHeight] = useState(0);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);

  const res = query.data;
  const post =
    res && res.status === 200 && res.data && "post" in res.data
      ? res.data.post
      : null;
  const media = post?.media[0];
  const uri =
    media?.type === "video"
      ? media.playbackStatus === "ready" && media.playbackUrl
        ? media.playbackUrl
        : media.mediaUrl
      : null;

  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.5;
  });

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    (async () => {
      try {
        await player.replaceAsync({ uri });
      } catch {
        if (media?.mediaUrl && media.mediaUrl !== uri) {
          try {
            await player.replaceAsync({ uri: media.mediaUrl });
          } catch {}
        }
      }
      if (!cancelled) {
        try {
          player.play();
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri, player, media?.mediaUrl]);

  useEffect(() => {
    try {
      player.muted = muted;
      if (isFocused && !held) player.play();
      else player.pause();
    } catch {}
  }, [muted, isFocused, held, player]);

  useEffect(() => () => void flushContentViews(), []);
  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/(app)/spotlight");

  return (
    <View
      className="flex-1 bg-black"
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <StatusBar barStyle="light-content" />
      {query.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#fff" />
        </View>
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
            onPress={() => router.replace("/(app)/spotlight")}
          />
        </View>
      ) : height > 0 ? (
        <SpotlightCard
          item={{ post, sponsored: null }}
          active={isFocused}
          height={height}
          player={player}
          muted={muted}
          onToggleMute={toggleMute}
          surface="deep_link"
          onHide={back}
          holdPlayback={setHeld}
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
