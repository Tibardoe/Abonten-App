import { useSession } from "@/auth/SessionProvider";
import {
  contentShareUrl,
  publisherLabel,
  shareContent,
  useRequireSignIn,
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
import { useStoryReply } from "@/features/content/useStoryReply";
import { copyText } from "@/features/messaging/clipboardSupport";
import { api } from "@/lib/api";
import { hapticLight, hapticSuccess } from "@/lib/haptics";

import { CONTENT_REACTIONS } from "@abonten/core/content/reactions";
import {
  formatStoryAge,
  isStoryActive,
} from "@abonten/core/content/storyExpiry";
import { IMAGE_DWELL_MS } from "@abonten/core/content/viewTracking";
import type {
  ContentPostDocument,
  ContentPublisherKind,
  ContentReactionEmoji,
} from "@abonten/types/contentType";
import {
  AppText,
  Avatar,
  Icon,
  useKeyboardLift,
  useReducedMotion,
  useToast,
} from "@abonten/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ZoomIn,
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
const MAX_REPLY_LENGTH = 1000;

/**
 * Full-screen Stories player: tap the left third for back, the rest for
 * next, hold to pause, drag down to close, swipe sideways for the next or
 * previous publisher.
 *
 * It renders inside a normal screen (the `story/play` route, or a shared
 * `story/[id]` link) rather than a <Modal>, so the reply bar can ride the
 * keyboard in the app's own window and a report sheet can open on top of a
 * Story without closing it first.
 *
 * Replies and reactions are private messages to the publisher (they land in
 * Messages with the Story attached), sent from the bar along the bottom
 * without leaving the Story.
 */
export function StoryViewer({
  queue,
  startIndex = 0,
  startStoryId,
  onClose,
  onReport,
}: {
  queue: StoryQueueEntry[];
  startIndex?: number;
  startStoryId?: string | null;
  onClose: () => void;
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
    Keyboard.dismiss();
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
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {!entry || sequence.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#fff" />
        </View>
      ) : sequence.isError || !sequence.data ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <AppText className="text-center text-white">
            Couldn't load these Stories.
          </AppText>
          <Pressable
            onPress={nextEntry}
            hitSlop={10}
            accessibilityRole="button"
          >
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
          onReport={onReport}
          publisherKind={entry.publisherKind}
          publisherId={entry.publisherId}
        />
      )}
    </View>
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
  const requireSignIn = useRequireSignIn();
  const invalidate = useInvalidateContent();
  const reduceMotion = useReducedMotion();
  const engagement = usePostEngagement(story, () => !!session);
  const replies = useStoryReply(story.id);
  const keyboard = useKeyboardLift();
  const isAuthor = story.viewer.isAuthor;

  const [loaded, setLoaded] = useState(false);
  const [holding, setHolding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [replyFocused, setReplyFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const [burst, setBurst] = useState<{ emoji: string; key: number } | null>(
    null,
  );
  const [sent, setSent] = useState<{
    conversationId: string;
    label: string;
  } | null>(null);
  const input = useRef<TextInput>(null);
  // The video has actually advanced since this slide loaded it.
  const startedRef = useRef(false);
  const paused = holding || menuOpen || !loaded || replyFocused;

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
    startedRef.current = false;
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
          // The fresh player reports "ended" for its empty source the moment
          // the real one starts loading (measured: currentTime 0, duration
          // 0). When the video is the first slide shown, that skipped it —
          // and closed a Story opened from Messages at once. Only an ending
          // after the video has actually played counts.
          if (!startedRef.current) return;
          play.onEnded();
          onNext();
        }),
        p.addListener("playingChange", ({ isPlaying }) => {
          if (isPlaying) play.onPlaying();
          else play.onPaused();
        }),
        p.addListener("timeUpdate", ({ currentTime }) => {
          if (currentTime > 0.1) startedRef.current = true;
          const dur = p.duration || media.durationSeconds || 0;
          if (dur > 0) progress.value = Math.min(1, currentTime / dur);
        }),
      );
    });
    (async () => {
      try {
        await player.replaceAsync({ uri: preferred });
        if (cancelled) return;
        runPlayer((p) => {
          // A cached source can already be ready, with no status change
          // left to announce it.
          if (p.status === "readyToPlay") setLoaded(true);
          p.play();
        });
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
    // `player` too: if the hook hands back a new player (it can be released
    // and recreated), loading the old one played sound into no view.
  }, [media?.id, player]);

  useEffect(() => {
    if (!isVideo) return;
    if (paused && loaded) runPlayer((p) => p.pause());
    else if (!paused) runPlayer((p) => p.play());
  }, [paused, loaded, isVideo, runPlayer]);

  // Image: a fixed dwell that freezes while held or while replying.
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

  // Keyboard hidden by the system (back button, swipe) = done replying.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidHide", () => {
      input.current?.blur();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(null), 3200);
    return () => clearTimeout(t);
  }, [sent]);
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 900);
    return () => clearTimeout(t);
  }, [burst]);

  const gesturesOn = !replyFocused;
  const tap = Gesture.Tap()
    .enabled(gesturesOn)
    .maxDuration(250)
    .onEnd((e) => {
      if (e.x < width / 3) runOnJS(onPrev)();
      else runOnJS(onNext)();
    });
  const longPress = Gesture.LongPress()
    .enabled(gesturesOn)
    .minDuration(200)
    .maxDistance(10_000)
    .onStart(() => runOnJS(setHolding)(true))
    .onFinalize(() => runOnJS(setHolding)(false));
  const pan = Gesture.Pan()
    .enabled(gesturesOn)
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
  // The footer sits on the safe area; when the keyboard opens it rides the
  // keyboard's top edge instead, frame by frame.
  const footerLift = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: -Math.max(0, keyboard.height.value - insets.bottom + 4),
      },
    ],
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

  const repliesPossible =
    !isAuthor && story.publisher.kind !== "abonten" && program.stories;
  const canReact = repliesPossible && program.storiesReactions;
  const canReply =
    repliesPossible && program.storiesComments && story.allowComments;
  const name = publisherLabel(story.publisher);
  const backdrop = isVideo
    ? (media?.posterUrl ?? media?.thumbnailUrl ?? undefined)
    : media?.mediaUrl;

  const sendReply = async () => {
    const text = draft.trim();
    if (!text || replies.sending) return;
    if (!requireSignIn()) return;
    const outcome = await replies.reply(text);
    if (!outcome.ok) {
      toast.error(outcome.message);
      return;
    }
    hapticSuccess();
    setDraft("");
    input.current?.blur();
    Keyboard.dismiss();
    setSent({ conversationId: outcome.conversationId, label: "Reply sent" });
  };

  const sendReaction = async (emoji: ContentReactionEmoji) => {
    if (!requireSignIn()) return;
    hapticLight();
    if (engagement.reaction === emoji) {
      // Same emoji again takes the reaction back; nothing is messaged.
      engagement.react(emoji);
      return;
    }
    const previous = engagement.reaction;
    engagement.setReaction(emoji);
    setBurst({ emoji, key: Date.now() });
    const outcome = await replies.react(emoji);
    if (!outcome.ok) {
      engagement.setReaction(previous);
      toast.error(outcome.message);
      return;
    }
    setSent({ conversationId: outcome.conversationId, label: "Reaction sent" });
  };

  const openConversation = (conversationId: string) => {
    onClose();
    setTimeout(
      () => router.push(`/(app)/messages/${conversationId}` as never),
      0,
    );
  };

  const menuItems: {
    icon:
      | "link-outline"
      | "volume-mute-outline"
      | "flag-outline"
      | "trash-outline"
      | "stats-chart-outline";
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
      label: `Mute ${name}`,
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
      icon: "stats-chart-outline",
      label: "Insights",
      onPress: () => {
        setMenuOpen(false);
        onClose();
        setTimeout(() => router.push(`/(app)/spotlight/post/${story.id}`), 0);
      },
    });
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

      {/* While replying: dim the Story; a tap on it just ends replying. */}
      {replyFocused ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(160)}
          exiting={reduceMotion ? undefined : FadeOut.duration(140)}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(0,0,0,0.4)" },
          ]}
        >
          <Pressable
            style={{ flex: 1 }}
            accessibilityRole="button"
            accessibilityLabel="Stop replying"
            onPress={() => {
              input.current?.blur();
              Keyboard.dismiss();
            }}
          />
        </Animated.View>
      ) : null}

      {burst ? (
        <Animated.View
          key={burst.key}
          pointerEvents="none"
          entering={reduceMotion ? undefined : ZoomIn.springify().damping(12)}
          exiting={reduceMotion ? undefined : FadeOut.duration(220)}
          style={[
            StyleSheet.absoluteFill,
            { alignItems: "center", justifyContent: "center" },
          ]}
        >
          <AppText style={{ fontSize: 96, lineHeight: 112 }}>
            {burst.emoji}
          </AppText>
        </Animated.View>
      ) : null}

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
            className="shrink flex-row items-center gap-2"
            accessibilityRole="link"
            accessibilityLabel={`${name}, open profile`}
            onPress={() => {
              const route =
                story.publisher.kind === "place"
                  ? `/(app)/place/${story.publisher.id}`
                  : story.publisher.username
                    ? `/(app)/user/${story.publisher.username}`
                    : null;
              if (!route) return;
              onClose();
              setTimeout(() => router.push(route as never), 0);
            }}
          >
            <Avatar
              publicId={story.publisher.avatarPublicId}
              version={story.publisher.avatarVersion}
              size={34}
            />
            <AppText
              numberOfLines={1}
              className="shrink text-[14px] font-semibold text-white"
            >
              {name}
            </AppText>
            <AppText className="text-[12px] text-white/75">
              {formatStoryAge(story.publishedAt)}
            </AppText>
          </Pressable>
          {!isAuthor && story.publisher.kind !== "abonten" ? (
            <FollowButton
              kind={story.publisher.kind === "place" ? "place" : "organizer"}
              targetId={story.publisher.id}
              ownerId={story.publisher.ownerId ?? story.authorId}
              label={story.publisher.name}
              known={story.viewer.following}
              onMedia
              inline
            />
          ) : null}
          <View className="flex-1" />
          <Pressable
            onPress={() => setMenuOpen((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Story options"
            className="h-9 w-9 items-center justify-center"
          >
            <Icon name="ellipsis-vertical" size={20} color="#fff" />
          </Pressable>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close Stories"
            className="h-9 w-9 items-center justify-center"
          >
            <Icon name="close" size={26} color="#fff" />
          </Pressable>
        </View>
      </Animated.View>

      {/* Footer: caption, CTA, then the reply bar riding the keyboard */}
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: insets.bottom + 10,
          },
          chromeStyle,
          footerLift,
        ]}
        pointerEvents={holding ? "none" : "box-none"}
        className="gap-2.5 px-3"
      >
        {sent ? (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(200)}
            exiting={reduceMotion ? undefined : FadeOut.duration(160)}
            className="flex-row items-center gap-2 self-center rounded-full bg-white px-3.5 py-2"
            accessibilityLiveRegion="polite"
          >
            <Icon name="checkmark-circle" size={16} color="#0F9D8F" />
            <AppText className="text-[13px] font-semibold text-black">
              {sent.label}
            </AppText>
            <Pressable
              onPress={() => openConversation(sent.conversationId)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="View the conversation"
            >
              <AppText className="text-[13px] font-bold text-[#0F9D8F]">
                View chat
              </AppText>
            </Pressable>
          </Animated.View>
        ) : null}

        {!replyFocused && story.caption ? (
          <AppText className="text-[14px] text-white">{story.caption}</AppText>
        ) : null}
        {!replyFocused && (story.event || story.place) ? (
          // Same live-state button as a Spotlight: a cancelled, ended or
          // sold-out event says so instead of offering a stale link.
          <ContentCta post={story} onNavigate={onClose} />
        ) : null}

        {replyFocused && canReact ? (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(180)}
            className="flex-row justify-between px-1"
          >
            {CONTENT_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => sendReaction(emoji)}
                accessibilityRole="button"
                accessibilityLabel={`React ${emoji}`}
                accessibilityState={{ selected: engagement.reaction === emoji }}
                hitSlop={4}
                className={[
                  "h-12 w-12 items-center justify-center rounded-full",
                  engagement.reaction === emoji ? "bg-white/25" : "",
                ].join(" ")}
              >
                <AppText className="text-[28px] leading-[34px]">
                  {emoji}
                </AppText>
              </Pressable>
            ))}
          </Animated.View>
        ) : null}

        {isAuthor ? (
          <Pressable
            onPress={() => {
              onClose();
              setTimeout(
                () => router.push(`/(app)/spotlight/post/${story.id}`),
                0,
              );
            }}
            accessibilityRole="button"
            accessibilityLabel={`${engagement.counts.views.toLocaleString()} viewed. Open insights`}
            className="flex-row items-center gap-1.5 self-start rounded-full bg-black/35 px-3 py-2"
          >
            <Icon name="eye-outline" size={16} color="#fff" />
            <AppText className="text-[13px] font-semibold text-white">
              {engagement.counts.views.toLocaleString()} viewed
            </AppText>
            <Icon name="chevron-forward" size={14} color="#fff" />
          </Pressable>
        ) : repliesPossible ? (
          <View className="flex-row items-end gap-2">
            {canReply ? (
              <View
                className={[
                  "min-h-[46px] flex-1 flex-row items-end rounded-3xl border px-4",
                  replyFocused
                    ? "border-white bg-black/55"
                    : "border-white/60 bg-black/25",
                ].join(" ")}
              >
                <TextInput
                  ref={input}
                  value={draft}
                  onChangeText={setDraft}
                  onFocus={() => {
                    if (!session) {
                      input.current?.blur();
                      requireSignIn();
                      return;
                    }
                    setReplyFocused(true);
                  }}
                  onBlur={() => setReplyFocused(false)}
                  maxLength={MAX_REPLY_LENGTH}
                  multiline
                  placeholder={`Reply to ${name}…`}
                  placeholderTextColor="rgba(255,255,255,0.75)"
                  accessibilityLabel={`Reply privately to ${name}`}
                  accessibilityHint="Sends a message with this Story attached"
                  selectionColor="#fff"
                  style={{
                    flex: 1,
                    color: "#fff",
                    fontSize: 15,
                    maxHeight: 110,
                    paddingTop: 12,
                    paddingBottom: 12,
                  }}
                />
              </View>
            ) : (
              <View className="min-h-[46px] flex-1 justify-center rounded-3xl border border-white/30 px-4">
                <AppText className="text-[14px] text-white/70">
                  Replies are off for this Story
                </AppText>
              </View>
            )}

            {replyFocused && draft.trim() ? (
              <Pressable
                onPress={sendReply}
                disabled={replies.sending}
                accessibilityRole="button"
                accessibilityLabel="Send reply"
                accessibilityState={{ busy: replies.sending }}
                className="h-[46px] w-[46px] items-center justify-center rounded-full bg-white"
              >
                {replies.sending ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Icon name="arrow-up" size={22} color="#000" />
                )}
              </Pressable>
            ) : (
              <>
                {canReact ? (
                  <Pressable
                    onPress={() => sendReaction("❤️")}
                    accessibilityRole="button"
                    accessibilityLabel={
                      engagement.reaction === "❤️"
                        ? "Remove your heart"
                        : "Send a heart"
                    }
                    accessibilityState={{
                      selected: engagement.reaction === "❤️",
                    }}
                    className="h-[46px] w-[42px] items-center justify-center"
                  >
                    <Icon
                      name={
                        engagement.reaction === "❤️" ? "heart" : "heart-outline"
                      }
                      size={28}
                      color={engagement.reaction === "❤️" ? "#ff3b5c" : "#fff"}
                    />
                  </Pressable>
                ) : null}
                {program.storiesSharing && !replyFocused ? (
                  <Pressable
                    onPress={async () => {
                      setHolding(true);
                      const outcome = await shareContent(story);
                      setHolding(false);
                      if (outcome.kind === "shared")
                        engagement.recordShare("native");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Share"
                    className="h-[46px] w-[42px] items-center justify-center"
                  >
                    <Icon name="paper-plane-outline" size={26} color="#fff" />
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ) : program.storiesSharing ? (
          <View className="flex-row justify-end">
            <Pressable
              onPress={async () => {
                setHolding(true);
                const outcome = await shareContent(story);
                setHolding(false);
                if (outcome.kind === "shared") engagement.recordShare("native");
              }}
              accessibilityRole="button"
              accessibilityLabel="Share"
              className="h-[46px] w-[46px] items-center justify-center"
            >
              <Icon name="paper-plane-outline" size={26} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </Animated.View>

      {menuOpen ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMenuOpen(false)}
            accessibilityLabel="Close menu"
          />
          <Animated.View
            entering={reduceMotion ? undefined : FadeIn.duration(120)}
            style={{ position: "absolute", right: 12, top: insets.top + 60 }}
            className="min-w-[200px] overflow-hidden rounded-2xl border border-border bg-popover"
          >
            {menuItems.map((item, i) => (
              <Pressable
                key={item.label}
                onPress={item.onPress}
                accessibilityRole="button"
                className={[
                  "min-h-[48px] flex-row items-center gap-3 px-4 py-3 active:bg-muted",
                  i > 0 ? "border-t border-border" : "",
                ].join(" ")}
              >
                <Icon
                  name={item.icon}
                  size={19}
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
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}
