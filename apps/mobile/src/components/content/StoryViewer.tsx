import { useSession } from "@/auth/SessionProvider";
import {
  contentShareUrl,
  publisherLabel,
  shareContent,
} from "@/features/content/contentLinks";
import {
  useInvalidateContent,
  usePostEngagement,
  useStorySequence,
} from "@/features/content/useContent";
import {
  CONTENT_KEY,
  useContentProgram,
} from "@/features/content/useContentProgram";
import {
  flushContentViews,
  usePlaySession,
} from "@/features/content/useContentTelemetry";
import { copyText } from "@/features/messaging/clipboardSupport";
import { api } from "@/lib/api";
import { hapticLight } from "@/lib/haptics";
import { CONTENT_REACTIONS } from "@abonten/core/content/reactions";
import {
  formatStoryAge,
  isStoryActive,
} from "@abonten/core/content/storyExpiry";
import { IMAGE_DWELL_MS } from "@abonten/core/content/viewTracking";
import type {
  ContentPostDocument,
  ContentPublisherKind,
} from "@abonten/types/contentType";
import { AppText, Avatar, Icon, useToast } from "@abonten/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ContentCta } from "./ContentCta";
import { FollowButton } from "./FollowButton";

export type StoryQueueEntry = {
  publisherKind: ContentPublisherKind;
  publisherId: string;
};

type Slide = { story: ContentPostDocument; mediaIndex: number };

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

/**
 * Full-screen Stories player (same gestures as the highlight viewer): tap
 * the left third for back, the rest for next, hold to pause, drag down to
 * close, swipe sideways for the next or previous publisher. Opening
 * comments or a report closes the viewer first (a sheet cannot sit on top
 * of this Modal on iOS); the parent opens it once the viewer has gone.
 */
export function StoryViewer({
  queue,
  startIndex = 0,
  startStoryId,
  onClose,
  onOpenComments,
  onReport,
}: {
  queue: StoryQueueEntry[];
  startIndex?: number;
  startStoryId?: string | null;
  onClose: () => void;
  onOpenComments?: (story: ContentPostDocument) => void;
  onReport?: (story: ContentPostDocument) => void;
}) {
  const qc = useQueryClient();
  const [entryIndex, setEntryIndex] = useState(startIndex);
  const entry = queue[entryIndex];
  const sequence = useStorySequence(entry?.publisherKind, entry?.publisherId);

  const closedRef = useRef(false);
  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
    // The last Story reports its view as it unmounts, so send the batch on
    // the next tick, then refresh the tray so its ring turns seen.
    setTimeout(() => {
      void flushContentViews().finally(() =>
        qc.invalidateQueries({ queryKey: [...CONTENT_KEY, "stories", "tray"] }),
      );
    }, 0);
  }, [onClose, qc]);

  const nextEntry = useCallback(() => {
    if (entryIndex + 1 < queue.length) setEntryIndex(entryIndex + 1);
    else close();
  }, [entryIndex, queue.length, close]);
  const prevEntry = useCallback(() => {
    if (entryIndex > 0) setEntryIndex(entryIndex - 1);
  }, [entryIndex]);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {sequence.isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#fff" />
            </View>
          ) : sequence.isError || !sequence.data ? (
            <View className="flex-1 items-center justify-center gap-3 px-8">
              <AppText className="text-center text-white">
                Couldn't load these Stories.
              </AppText>
              <Pressable onPress={nextEntry}>
                <AppText className="font-semibold text-white underline">
                  Continue
                </AppText>
              </Pressable>
            </View>
          ) : (
            <SequencePlayer
              key={`${entry.publisherKind}:${entry.publisherId}`}
              stories={sequence.data.stories}
              startStoryId={entryIndex === startIndex ? startStoryId : null}
              onFinished={nextEntry}
              onBeforeFirst={prevEntry}
              onNextPublisher={nextEntry}
              onPrevPublisher={prevEntry}
              onClose={close}
              onOpenComments={onOpenComments}
              onReport={onReport}
              publisherKind={entry.publisherKind}
              publisherId={entry.publisherId}
            />
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function SequencePlayer({
  stories: initial,
  startStoryId,
  onFinished,
  onBeforeFirst,
  onNextPublisher,
  onPrevPublisher,
  onClose,
  onOpenComments,
  onReport,
  publisherKind,
  publisherId,
}: {
  stories: ContentPostDocument[];
  startStoryId?: string | null;
  onFinished: () => void;
  onBeforeFirst: () => void;
  onNextPublisher: () => void;
  onPrevPublisher: () => void;
  onClose: () => void;
  onOpenComments?: (story: ContentPostDocument) => void;
  onReport?: (story: ContentPostDocument) => void;
  publisherKind: ContentPublisherKind;
  publisherId: string;
}) {
  const [stories, setStories] = useState(() =>
    initial.filter((s) => s.viewer.isAuthor || isStoryActive(s)),
  );
  const slides: Slide[] = useMemo(
    () =>
      stories.flatMap((story) =>
        story.media.map((_, mediaIndex) => ({ story, mediaIndex })),
      ),
    [stories],
  );
  const [index, setIndex] = useState(() => {
    const target = startStoryId
      ? slides.findIndex((s) => s.story.id === startStoryId)
      : slides.findIndex((s) => !s.story.viewer.seen);
    return Math.max(0, target);
  });

  useEffect(() => {
    if (slides.length === 0) onFinished();
  }, [slides.length, onFinished]);

  const slide = slides[Math.min(index, slides.length - 1)];
  if (!slide) return null;

  return (
    <StorySlide
      key={`${slide.story.id}:${slide.mediaIndex}`}
      slide={slide}
      index={index}
      total={slides.length}
      onNext={() =>
        index + 1 < slides.length ? setIndex(index + 1) : onFinished()
      }
      onPrev={() => (index > 0 ? setIndex(index - 1) : onBeforeFirst())}
      onNextPublisher={onNextPublisher}
      onPrevPublisher={onPrevPublisher}
      onRemoved={() => {
        const id = slide.story.id;
        const first = slides.findIndex((s) => s.story.id === id);
        setStories((prev) => prev.filter((s) => s.id !== id));
        setIndex(Math.max(0, first));
      }}
      onClose={onClose}
      onOpenComments={onOpenComments}
      onReport={onReport}
      publisherKind={publisherKind}
      publisherId={publisherId}
    />
  );
}

function StorySlide({
  slide,
  index,
  total,
  onNext,
  onPrev,
  onNextPublisher,
  onPrevPublisher,
  onRemoved,
  onClose,
  onOpenComments,
  onReport,
  publisherKind,
  publisherId,
}: {
  slide: Slide;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onNextPublisher: () => void;
  onPrevPublisher: () => void;
  onRemoved: () => void;
  onClose: () => void;
  onOpenComments?: (story: ContentPostDocument) => void;
  onReport?: (story: ContentPostDocument) => void;
  publisherKind: ContentPublisherKind;
  publisherId: string;
}) {
  const { story, mediaIndex } = slide;
  const media = story.media[mediaIndex] ?? story.media[0];
  const isVideo = media?.type === "video";
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { session } = useSession();
  const { program } = useContentProgram();
  const invalidate = useInvalidateContent();
  const engagement = usePostEngagement(story, () => !!session);
  const isAuthor = story.viewer.isAuthor;

  const [loaded, setLoaded] = useState(false);
  const [holding, setHolding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const paused = holding || menuOpen || !loaded;

  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const chrome = useSharedValue(1);

  const play = usePlaySession({
    postId: story.id,
    surface: "stories",
    active: true,
    durationMs:
      isVideo && media?.durationSeconds ? media.durationSeconds * 1000 : null,
  });

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
  });
  const runPlayer = useCallback(
    (fn: (p: typeof player) => void) => {
      try {
        fn(player);
      } catch {
        // released on unmount
      }
    },
    [player],
  );

  useEffect(() => {
    chrome.value = withTiming(holding ? 0 : 1, { duration: 150 });
  }, [holding, chrome]);

  // Video: load, then follow its clock.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the media identity
  useEffect(() => {
    if (!isVideo || !media) return;
    const preferred =
      media.playbackStatus === "ready" && media.playbackUrl
        ? media.playbackUrl
        : media.mediaUrl;
    let cancelled = false;
    const subs: { remove: () => void }[] = [];
    runPlayer((p) => {
      subs.push(
        p.addListener("statusChange", ({ status }) => {
          if (status === "readyToPlay") setLoaded(true);
          if (status === "error") {
            if (preferred !== media.mediaUrl) {
              void p
                .replaceAsync({ uri: media.mediaUrl })
                .catch(() => onNext());
            } else {
              onNext();
            }
          }
        }),
        p.addListener("playToEnd", () => {
          play.onEnded();
          onNext();
        }),
        p.addListener("playingChange", ({ isPlaying }) => {
          if (isPlaying) play.onPlaying();
          else play.onPaused();
        }),
        p.addListener("timeUpdate", ({ currentTime }) => {
          const dur = p.duration || media.durationSeconds || 0;
          if (dur > 0) progress.value = Math.min(1, currentTime / dur);
        }),
      );
    });
    (async () => {
      try {
        await player.replaceAsync({ uri: preferred });
        if (!cancelled) runPlayer((p) => p.play());
      } catch {
        if (!cancelled) onNext();
      }
    })();
    return () => {
      cancelled = true;
      for (const s of subs) {
        try {
          s.remove();
        } catch {}
      }
      runPlayer((p) => p.pause());
    };
  }, [media?.id]);

  useEffect(() => {
    if (!isVideo) return;
    if (paused && loaded) runPlayer((p) => p.pause());
    else if (!paused) runPlayer((p) => p.play());
  }, [paused, loaded, isVideo, runPlayer]);

  // Image: a fixed dwell that freezes while held.
  // biome-ignore lint/correctness/useExhaustiveDependencies: progress is a stable shared value
  useEffect(() => {
    if (isVideo || !loaded) return;
    if (paused) {
      cancelAnimation(progress);
      play.onPaused();
      return;
    }
    play.onPlaying();
    const remaining = IMAGE_DWELL_MS * (1 - progress.value);
    progress.value = withTiming(
      1,
      { duration: Math.max(0, remaining), easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(onNext)();
      },
    );
    return () => cancelAnimation(progress);
  }, [isVideo, loaded, paused, onNext, play]);

  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e) => {
      if (e.x < width / 3) runOnJS(onPrev)();
      else runOnJS(onNext)();
    });
  const longPress = Gesture.LongPress()
    .minDuration(200)
    .maxDistance(10_000)
    .onStart(() => runOnJS(setHolding)(true))
    .onFinalize(() => runOnJS(setHolding)(false));
  const pan = Gesture.Pan()
    .minDistance(14)
    .onUpdate((e) => {
      if (
        e.translationY > 0 &&
        Math.abs(e.translationY) > Math.abs(e.translationX)
      ) {
        dragY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      const horizontal = Math.abs(e.translationX) > Math.abs(e.translationY);
      if (
        !horizontal &&
        (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY)
      ) {
        dragY.value = withTiming(height, { duration: 160 }, (f) => {
          if (f) runOnJS(onClose)();
        });
        return;
      }
      if (horizontal && Math.abs(e.translationX) > 60) {
        if (e.translationX < 0) runOnJS(onNextPublisher)();
        else runOnJS(onPrevPublisher)();
      }
      dragY.value = withSpring(0, { damping: 18 });
    });
  const gesture = Gesture.Race(pan, longPress, tap);

  const surfaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));
  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, progress.value * 100))}%`,
  }));

  const deleteStory = () => {
    setMenuOpen(false);
    Alert.alert("Delete this Story?", "It disappears for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const res = await api.content.deletePost(story.id);
          if (res.status !== 200) {
            toast.error(res.message ?? "Couldn't delete this Story.");
            return;
          }
          invalidate();
          onRemoved();
        },
      },
    ]);
  };

  const muteStories = async () => {
    setMenuOpen(false);
    const res = await api.content.muteStories(publisherKind, publisherId, true);
    if (res.status !== 200) {
      toast.error(res.message ?? "Couldn't mute these Stories.");
      return;
    }
    toast.success(`Stories from ${publisherLabel(story.publisher)} muted`);
    onClose();
  };

  const canReact = !isAuthor && !!session && program.storiesReactions;
  const canComment = program.storiesComments && story.allowComments;
  const backdrop = isVideo
    ? (media?.posterUrl ?? media?.thumbnailUrl ?? undefined)
    : media?.mediaUrl;

  const menuItems: {
    icon:
      | "link-outline"
      | "volume-mute-outline"
      | "flag-outline"
      | "trash-outline";
    label: string;
    onPress: () => void;
    destructive?: boolean;
  }[] = [
    {
      icon: "link-outline",
      label: "Copy link",
      onPress: async () => {
        setMenuOpen(false);
        const ok = await copyText(contentShareUrl("story", story.id));
        if (ok) toast.success("Link copied");
      },
    },
  ];
  if (!isAuthor && session) {
    menuItems.push({
      icon: "volume-mute-outline",
      label: `Mute ${publisherLabel(story.publisher)}`,
      onPress: muteStories,
    });
    if (onReport) {
      menuItems.push({
        icon: "flag-outline",
        label: "Report Story",
        destructive: true,
        onPress: () => {
          setMenuOpen(false);
          onReport(story);
        },
      });
    }
  }
  if (isAuthor) {
    menuItems.push({
      icon: "trash-outline",
      label: "Delete Story",
      destructive: true,
      onPress: deleteStory,
    });
  }

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ flex: 1 }, surfaceStyle]}>
          {backdrop ? (
            <Image
              source={{ uri: backdrop }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              blurRadius={40}
            />
          ) : null}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.45)" },
            ]}
          />
          {isVideo ? (
            <VideoView
              player={player}
              style={{ position: "absolute", width, height }}
              contentFit="contain"
              nativeControls={false}
            />
          ) : media ? (
            <Image
              source={{ uri: media.mediaUrl }}
              style={{ position: "absolute", width, height }}
              contentFit="contain"
              onLoadEnd={() => setLoaded(true)}
              onError={() => onNext()}
            />
          ) : null}
          {!loaded ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { alignItems: "center", justifyContent: "center" },
              ]}
            >
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>

      {/* Header */}
      <Animated.View
        style={[
          { position: "absolute", left: 0, right: 0, top: insets.top + 8 },
          chromeStyle,
        ]}
        pointerEvents={holding ? "none" : "box-none"}
      >
        <View className="flex-row gap-1 px-3">
          {Array.from({ length: total }, (_, i) => (
            <View
              key={`bar-${i.toString()}`}
              className="h-[3px] flex-1 overflow-hidden rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.4)" }}
            >
              {i < index ? (
                <View style={{ flex: 1, backgroundColor: "#fff" }} />
              ) : i === index ? (
                <Animated.View
                  style={[
                    { height: "100%", backgroundColor: "#fff" },
                    barStyle,
                  ]}
                />
              ) : null}
            </View>
          ))}
        </View>
        <View className="mt-3 flex-row items-center gap-2 px-3">
          <Pressable
            className="flex-1 flex-row items-center gap-2"
            onPress={() => {
              const route =
                story.publisher.kind === "place"
                  ? `/(app)/place/${story.publisher.id}`
                  : story.publisher.username
                    ? `/(app)/user/${story.publisher.username}`
                    : null;
              if (!route) return;
              onClose();
              router.push(route as never);
            }}
          >
            <Avatar
              publicId={story.publisher.avatarPublicId}
              version={story.publisher.avatarVersion}
              size={32}
            />
            <AppText
              numberOfLines={1}
              className="shrink text-[14px] font-semibold text-white"
            >
              {publisherLabel(story.publisher)}
            </AppText>
            <AppText className="text-[12px] text-white/75">
              {formatStoryAge(story.publishedAt)}
            </AppText>
          </Pressable>
          {!isAuthor &&
          !story.viewer.following &&
          story.publisher.kind !== "abonten" ? (
            <FollowButton
              kind={story.publisher.kind === "place" ? "place" : "organizer"}
              targetId={story.publisher.id}
              ownerId={story.publisher.ownerId ?? story.authorId}
              label={story.publisher.name}
              known={story.viewer.following}
              onMedia
            />
          ) : null}
          <Pressable
            onPress={() => setMenuOpen((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Story options"
          >
            <Icon name="ellipsis-vertical" size={20} color="#fff" />
          </Pressable>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Icon name="close" size={26} color="#fff" />
          </Pressable>
        </View>
      </Animated.View>

      {/* Footer */}
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 12,
            right: 12,
            bottom: insets.bottom + 16,
          },
          chromeStyle,
        ]}
        pointerEvents={holding ? "none" : "box-none"}
        className="gap-2"
      >
        {story.caption ? (
          <AppText className="text-[14px] text-white">{story.caption}</AppText>
        ) : null}
        {story.event || story.place ? (
          // Same live-state button as a Spotlight: a cancelled, ended or
          // sold-out event says so instead of offering a stale link.
          <ContentCta post={story} onNavigate={onClose} />
        ) : null}
        <View className="flex-row items-center gap-2">
          {isAuthor ? (
            <View className="flex-1 flex-row items-center gap-1">
              <Icon name="eye-outline" size={16} color="#fff" />
              <AppText className="text-[13px] text-white">
                {engagement.counts.views.toLocaleString()} viewed
              </AppText>
            </View>
          ) : canReact ? (
            <View className="flex-1 flex-row items-center">
              {CONTENT_REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    hapticLight();
                    engagement.react(emoji);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`React ${emoji}`}
                  accessibilityState={{
                    selected: engagement.reaction === emoji,
                  }}
                  className={[
                    "rounded-full px-1.5 py-1",
                    engagement.reaction === emoji ? "bg-white/25" : "",
                  ].join(" ")}
                >
                  <AppText className="text-[22px]">{emoji}</AppText>
                </Pressable>
              ))}
            </View>
          ) : (
            <View className="flex-1" />
          )}
          {canComment && onOpenComments ? (
            <Pressable
              onPress={() => onOpenComments(story)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Comments"
            >
              <Icon name="chatbubble-outline" size={24} color="#fff" />
            </Pressable>
          ) : null}
          {program.storiesSharing ? (
            <Pressable
              onPress={async () => {
                setHolding(true);
                const outcome = await shareContent(story);
                setHolding(false);
                if (outcome.kind === "shared") engagement.recordShare("native");
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Share"
            >
              <Icon name="paper-plane-outline" size={24} color="#fff" />
            </Pressable>
          ) : null}
        </View>
      </Animated.View>

      {menuOpen ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMenuOpen(false)}
          />
          <View
            style={{ position: "absolute", right: 12, top: insets.top + 60 }}
            className="overflow-hidden rounded-xl border border-border bg-popover"
          >
            {menuItems.map((item) => (
              <Pressable
                key={item.label}
                onPress={item.onPress}
                className="min-h-[44px] flex-row items-center gap-2 px-4 py-3 active:opacity-70"
              >
                <Icon
                  name={item.icon}
                  size={18}
                  tone={item.destructive ? "destructive" : "foreground"}
                />
                <AppText
                  variant="small"
                  tone={item.destructive ? "error" : undefined}
                  className="font-medium"
                >
                  {item.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}
