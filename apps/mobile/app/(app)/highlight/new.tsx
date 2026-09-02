import { useSession } from "@/auth/SessionProvider";
import { ImageCropModal } from "@/components/profile/ImageCropModal";
import { VideoTrimBar } from "@/components/profile/VideoTrimBar";
import { useHighlightUpload } from "@/features/profile/HighlightUploadProvider";
import { useHighlightComposer } from "@/features/profile/useHighlightComposer";
import type { HighlightMediaPick } from "@/features/profile/useHighlights";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Full-screen highlight composer: pick → preview → crop / trim → post.
// Native echo of the web `HighlightModal`. On Post the batch is handed to
// the app-level HighlightUploadProvider and this screen closes immediately;
// a progress banner then runs on the profile's highlights row.

export default function NewHighlight() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user.id;

  const composer = useHighlightComposer();
  const upload = useHighlightUpload();

  const [step, setStep] = useState<1 | 2>(1);
  const [cropOpen, setCropOpen] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);

  const active = composer.activeItem;
  const isVideo = active?.type === "video";

  const { width } = useWindowDimensions();
  const previewX = useSharedValue(0);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.2;
  });

  // Swipe the preview stage left/right to move between the picked items —
  // the same WhatsApp-style transition the HighlightViewer uses. `dir` is
  // +1 for the next item, -1 for the previous.
  const swipeItem = useCallback(
    (dir: 1 | -1) => {
      const idx = composer.activeIndex;
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= composer.items.length) {
        previewX.value = withSpring(0, { damping: 18 });
        return;
      }
      const nextId = composer.items[target].id;
      previewX.value = withTiming(-dir * width, { duration: 180 }, (f) => {
        if (!f) return;
        runOnJS(composer.select)(nextId);
        previewX.value = dir * width;
        previewX.value = withTiming(0, { duration: 180 });
      });
    },
    [composer.activeIndex, composer.items, composer.select, previewX, width],
  );

  const previewPan = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      previewX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 70 || Math.abs(e.velocityX) > 700) {
        runOnJS(swipeItem)(e.translationX < 0 ? 1 : -1);
      } else {
        previewX.value = withSpring(0, { damping: 18 });
      }
    });

  const previewStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: previewX.value }],
  }));

  // Fall back to the picker step if every item was removed.
  useEffect(() => {
    if (step === 2 && composer.items.length === 0) setStep(1);
  }, [step, composer.items.length]);

  // Load the active video into the player; reset the preview-ready gate on
  // any item change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the active item identity
  useEffect(() => {
    setPreviewReady(false);
    setPlaying(false);
    if (!active || active.type !== "video") return;
    let cancelled = false;
    (async () => {
      try {
        await player.replaceAsync({ uri: active.uri });
        if (cancelled) return;
        player.muted = muted;
        player.currentTime = active.startSeconds ?? 0;
      } catch {
        setPreviewReady(true); // don't strand Post on a load failure
      }
    })();
    return () => {
      cancelled = true;
      player.pause();
    };
  }, [active?.id, active?.uri]);

  useEffect(() => {
    if (!isVideo) return;
    const s1 = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") setPreviewReady(true);
    });
    const s2 = player.addListener("playingChange", ({ isPlaying }) =>
      setPlaying(isPlaying),
    );
    return () => {
      s1.remove();
      s2.remove();
    };
  }, [isVideo, player]);

  async function pick() {
    const ok = await composer.pickFromLibrary();
    if (ok) setStep(2);
  }

  function togglePlay() {
    if (player.playing) player.pause();
    else {
      if (
        active &&
        (player.currentTime >= (active.endSeconds ?? 1e9) - 0.05 ||
          player.currentTime < (active.startSeconds ?? 0))
      ) {
        player.currentTime = active.startSeconds ?? 0;
      }
      player.play();
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  }

  function post() {
    if (!userId || composer.items.length === 0) return;
    const media: HighlightMediaPick[] = composer.items.map((m) => ({
      uri: m.uri,
      type: m.type,
      durationSeconds: m.durationSeconds,
      startSeconds: m.type === "video" ? m.startSeconds : null,
      endSeconds: m.type === "video" ? m.endSeconds : null,
    }));
    upload.start(userId, media);
    composer.reset();
    router.back();
  }

  // ---- step 1: empty picker --------------------------------------------
  if (step === 1) {
    return (
      <View className="flex-1 bg-black">
        <View
          style={{ paddingTop: insets.top + 6 }}
          className="flex-row items-center justify-between px-4"
        >
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Icon name="close" size={26} color="#fff" />
          </Pressable>
          <AppText className="text-[16px] font-semibold text-white">
            New highlight
          </AppText>
          <View style={{ width: 26 }} />
        </View>

        <View className="flex-1 items-center justify-center gap-6 px-8">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-white/10">
            <Icon name="images-outline" size={40} color="#fff" />
          </View>
          <AppText className="text-center text-[15px] text-white/80">
            Add photos and videos to your highlights. Trim clips and crop photos
            before you post.
          </AppText>
          <Button title="Select from gallery" size="lg" onPress={pick} />
        </View>
      </View>
    );
  }

  // ---- step 2: editor ------------------------------------------------
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-black">
        {/* top bar */}
        <View
          style={{ paddingTop: insets.top + 6 }}
          className="flex-row items-center gap-3 px-4 pb-2"
        >
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Icon name="close" size={26} color="#fff" />
          </Pressable>
          <AppText className="flex-1 text-[15px] font-semibold text-white">
            {composer.items.length > 1
              ? `${composer.activeIndex + 1} / ${composer.items.length}`
              : "New highlight"}
          </AppText>
          {active?.type === "image" ? (
            <Pressable
              onPress={() => setCropOpen(true)}
              hitSlop={10}
              accessibilityLabel="Crop photo"
            >
              <Icon name="crop-outline" size={22} color="#fff" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={post}
            disabled={!previewReady || upload.isUploading}
            hitSlop={10}
          >
            <AppText
              className={[
                "text-[15px] font-bold",
                previewReady && !upload.isUploading
                  ? "text-mint"
                  : "text-white/40",
              ].join(" ")}
            >
              Post
            </AppText>
          </Pressable>
        </View>

        {/* preview stage — swipe left/right to move between picked items */}
        <GestureDetector gesture={previewPan}>
          <Animated.View className="flex-1" style={previewStyle}>
            {active ? (
              active.type === "image" ? (
                <Image
                  source={{ uri: active.uri }}
                  style={{ flex: 1 }}
                  contentFit="contain"
                  onLoadEnd={() => setPreviewReady(true)}
                />
              ) : (
                <View className="flex-1">
                  <VideoView
                    player={player}
                    style={{ flex: 1 }}
                    contentFit="contain"
                    nativeControls={false}
                  />
                  <Pressable
                    onPress={togglePlay}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {!playing ? (
                      <View className="h-16 w-16 items-center justify-center rounded-full bg-black/50">
                        <Icon name="play" size={30} color="#fff" />
                      </View>
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={toggleMute}
                    hitSlop={10}
                    style={{ position: "absolute", right: 14, top: 12 }}
                    className="h-9 w-9 items-center justify-center rounded-full bg-black/50"
                  >
                    <Icon
                      name={muted ? "volume-mute" : "volume-high"}
                      size={18}
                      color="#fff"
                    />
                  </Pressable>
                </View>
              )
            ) : null}

            {!previewReady ? (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
          </Animated.View>
        </GestureDetector>

        {/* trim bar (video only) */}
        {active && active.type === "video" ? (
          <View className="py-3">
            <VideoTrimBar
              player={player}
              item={active}
              onTrimChange={(s, e) => composer.updateTrim(active.id, s, e)}
            />
          </View>
        ) : null}

        {/* filmstrip */}
        {composer.items.length > 0 ? (
          <View style={{ paddingBottom: insets.bottom + 10 }} className="pt-2">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 px-4"
            >
              {composer.items.map((m, i) => {
                const selected = m.id === composer.activeId;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => composer.select(m.id)}
                    className={[
                      "h-20 w-16 overflow-hidden rounded-lg border-2",
                      selected ? "border-mint" : "border-transparent",
                    ].join(" ")}
                  >
                    {m.type === "image" ? (
                      <Image
                        source={{ uri: m.uri }}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="cover"
                      />
                    ) : (
                      <View className="flex-1 items-center justify-center bg-white/10">
                        <Icon name="videocam" size={18} color="#fff" />
                      </View>
                    )}

                    {/* delete */}
                    <Pressable
                      onPress={() => composer.remove(m.id)}
                      hitSlop={6}
                      style={{ position: "absolute", right: 2, top: 2 }}
                      className="h-5 w-5 items-center justify-center rounded-full bg-black/70"
                    >
                      <Icon name="close" size={12} color="#fff" />
                    </Pressable>

                    {/* reorder (selected + multiple) */}
                    {selected && composer.items.length > 1 ? (
                      <View
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                        }}
                        className="flex-row justify-between bg-black/60"
                      >
                        <Pressable
                          onPress={() =>
                            i > 0 &&
                            composer.reorder(m.id, composer.items[i - 1].id)
                          }
                          hitSlop={4}
                          className="px-1"
                        >
                          <Icon name="chevron-back" size={14} color="#fff" />
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            i < composer.items.length - 1 &&
                            composer.reorder(m.id, composer.items[i + 1].id)
                          }
                          hitSlop={4}
                          className="px-1"
                        >
                          <Icon name="chevron-forward" size={14} color="#fff" />
                        </Pressable>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}

              {/* add more */}
              <Pressable
                onPress={pick}
                className="h-20 w-16 items-center justify-center rounded-lg border-2 border-dashed border-white/30"
              >
                <Icon name="add" size={22} color="#fff" />
              </Pressable>
            </ScrollView>
          </View>
        ) : null}

        {active && active.type === "image" ? (
          <ImageCropModal
            visible={cropOpen}
            uri={active.uri}
            sourceWidth={active.width}
            sourceHeight={active.height}
            onCancel={() => setCropOpen(false)}
            onDone={(r) => {
              composer.replaceCropped(active.id, r.uri, r.width, r.height);
              setCropOpen(false);
            }}
          />
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}
