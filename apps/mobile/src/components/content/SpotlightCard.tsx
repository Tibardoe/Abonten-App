import {
  publisherLabel,
  publisherRoute,
  shareContent,
  useRequireSignIn,
} from "@/features/content/contentLinks";
import {
  toggleSpotlightMuted,
  useSpotlightMuted,
} from "@/features/content/playback/spotlightSound";
import { usePostEngagement } from "@/features/content/useContent";
import {
  trackContentClick,
  usePlaySession,
} from "@/features/content/useContentTelemetry";
import { hapticLight } from "@/lib/haptics";
import { useAppActive } from "@/lib/useAppActive";
import { SPONSORED_LABEL } from "@abonten/core/content/copy";
import {
  type FeedPlaybackMode,
  feedPosterUrl,
  feedShouldPlay,
} from "@abonten/core/content/feedPlayback";
import { formatStoryAge } from "@abonten/core/content/storyExpiry";
import type {
  ContentFeedItem,
  ContentViewSurface,
} from "@abonten/types/contentType";
import {
  AppText,
  Avatar,
  Icon,
  type IoniconName,
  useReducedMotion,
} from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useState } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ContentCta } from "./ContentCta";
import { ContentOptionsSheet } from "./ContentOptionsSheet";
import { FollowButton } from "./FollowButton";
import { SpotlightCommentsPanel } from "./SpotlightCommentsPanel";
import { SpotlightVideo } from "./SpotlightVideo";

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// Comments shrink the video to this share of the card.
const COMPACT_VIDEO_RATIO = 0.34;
const OPEN_MS = 280;
const CLOSE_MS = 220;

/**
 * One full-height Spotlight page. Its video (SpotlightVideo) owns its own
 * player while the page is active or a direct neighbour (`mode`), and has
 * none otherwise, so the feed never holds more than three decoders. The
 * page plays only while `feedShouldPlay` says so: active, screen focused,
 * app in front, not covered by a sheet, not paused by a tap. Sound is the
 * app-wide Spotlight preference (spotlightSound.ts).
 *
 * Layout, bottom up: the full-width event/place CTA; above it the creator
 * (avatar and name open the profile, Follow sits beside the name) and the
 * caption on the left, with the action rail (like, comment, share, save,
 * insights on your own post, more) on the right. The two columns never
 * overlap because they are laid out side by side, not stacked absolutely.
 */
export const SpotlightCard = memo(function SpotlightCard({
  item,
  mode,
  screenFocused,
  height,
  surface,
  onHide,
  bottomInset,
  bottomObstruction = 0,
  topInset,
  onCommentsOpenChange,
}: {
  item: ContentFeedItem;
  /** This page's place in the feed's media lifecycle. */
  mode: FeedPlaybackMode;
  /** The screen showing the feed is the focused one. */
  screenFocused: boolean;
  height: number;
  surface: ContentViewSurface;
  onHide?: (postId: string) => void;
  /** Space to keep clear under the controls (safe area / breathing room). */
  bottomInset: number;
  /** Height of a bar under the card (the tab bar) the keyboard slides over. */
  bottomObstruction?: number;
  /** Space the screen's own header takes at the top. */
  topInset: number;
  onCommentsOpenChange?: (open: boolean) => void;
}) {
  const { post, sponsored } = item;
  const campaignId = sponsored?.campaignId ?? null;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const requireSignIn = useRequireSignIn();
  const engagement = usePostEngagement(post, requireSignIn);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsMounted, setCommentsMounted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const muted = useSpotlightMuted();
  const appActive = useAppActive();
  const active = mode === "active" && screenFocused;

  const media = post.media[0];
  const isVideo = media?.type === "video";
  const poster = feedPosterUrl(media);

  const play = usePlaySession({
    postId: post.id,
    surface,
    campaignId,
    active,
    durationMs:
      isVideo && media?.durationSeconds ? media.durationSeconds * 1000 : null,
  });

  // Comments keep the video playing (it stays on screen); the options sheet
  // covers it, so that pauses.
  const held = optionsOpen;
  const shouldPlay = feedShouldPlay({
    mode,
    screenFocused,
    appActive,
    held,
    userPaused: paused,
  });

  // A tap-to-pause belongs to one viewing: scrolling away forgets it.
  useEffect(() => {
    if (!active) setPaused(false);
  }, [active]);

  // Images count as watched while their page is on screen.
  useEffect(() => {
    if (!active || isVideo) return;
    if (held) play.onPaused();
    else play.onPlaying();
    return () => play.onPaused();
  }, [active, isVideo, held, play]);

  const onPlayingChange = useCallback(
    (playing: boolean) => {
      if (!active) return;
      if (playing) play.onPlaying();
      else play.onPaused();
    },
    [active, play],
  );
  const onLoop = useCallback(() => {
    play.onEnded();
    play.onLoop();
  }, [play]);

  const togglePause = () => {
    if (commentsOpen) {
      closeComments();
      return;
    }
    if (!isVideo || !active) return;
    hapticLight();
    setPaused((v) => !v);
  };

  // ── Comments: shrink the video, raise the panel ───────────────────
  const progress = useSharedValue(0);
  const topGap = insets.top + 8;
  const compactHeight = Math.max(180, height * COMPACT_VIDEO_RATIO);
  const panelHeight = Math.max(260, height - (topGap + compactHeight) - 8);

  const finishClose = useCallback(() => setCommentsMounted(false), []);
  const openComments = () => {
    hapticLight();
    setCommentsMounted(true);
    setCommentsOpen(true);
    onCommentsOpenChange?.(true);
    progress.value = reduceMotion
      ? 1
      : withTiming(1, {
          duration: OPEN_MS,
          easing: Easing.out(Easing.cubic),
        });
  };
  const closeComments = useCallback(() => {
    Keyboard.dismiss();
    setCommentsOpen(false);
    onCommentsOpenChange?.(false);
    if (reduceMotion) {
      progress.value = 0;
      finishClose();
      return;
    }
    progress.value = withTiming(
      0,
      { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) },
      (done) => {
        if (done) runOnJS(finishClose)();
      },
    );
  }, [finishClose, onCommentsOpenChange, progress, reduceMotion]);

  // Swiped away (or the screen lost focus) with comments open: reset.
  useEffect(() => {
    if (!active && commentsMounted) {
      progress.value = 0;
      setCommentsOpen(false);
      setCommentsMounted(false);
      onCommentsOpenChange?.(false);
    }
  }, [active, commentsMounted, onCommentsOpenChange, progress]);

  const mediaStyle = useAnimatedStyle(() => {
    const scale = compactHeight / height;
    const ty = topGap + compactHeight / 2 - height / 2;
    return {
      transform: [
        { translateY: progress.value * ty },
        { scale: 1 + progress.value * (scale - 1) },
      ],
      borderRadius: progress.value * 18,
    };
  });
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, progress.value * 1.6),
  }));

  if (engagement.notInterested) {
    return (
      <View
        style={{ height }}
        className="items-center justify-center gap-3 bg-black px-8"
      >
        <AppText className="text-center text-white">
          Thanks. You'll see fewer posts like this.
        </AppText>
        <Pressable
          onPress={() => engagement.markNotInterested(false)}
          hitSlop={10}
          accessibilityRole="button"
        >
          <AppText className="font-semibold text-white underline">Undo</AppText>
        </Pressable>
      </View>
    );
  }

  const profileHref = publisherRoute(post.publisher);
  const followTarget =
    post.publisher.kind === "place"
      ? ("place" as const)
      : post.publisher.kind === "organizer"
        ? ("organizer" as const)
        : null;
  const name = publisherLabel(post.publisher);
  const openProfile = () => {
    if (!profileHref) return;
    trackContentClick(post.id, "profile", campaignId);
    router.push(profileHref as never);
  };
  const share = async () => {
    const outcome = await shareContent(post);
    if (outcome.kind === "shared") engagement.recordShare("native");
  };

  return (
    <View style={{ height }} className="overflow-hidden bg-black">
      <Animated.View
        style={[StyleSheet.absoluteFill, { overflow: "hidden" }, mediaStyle]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={togglePause}
          onLongPress={() => !commentsOpen && setOptionsOpen(true)}
          accessibilityLabel={
            commentsOpen
              ? "Close comments"
              : isVideo
                ? paused
                  ? "Play"
                  : "Pause"
                : "Spotlight photo"
          }
        >
          {isVideo && media ? (
            <SpotlightVideo
              media={media}
              mode={mode}
              shouldPlay={shouldPlay}
              posterUri={poster}
              recyclingKey={post.id}
              onPlayingChange={onPlayingChange}
              onLoop={onLoop}
            />
          ) : poster ? (
            <Image
              source={{ uri: poster }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              cachePolicy="memory-disk"
              recyclingKey={post.id}
            />
          ) : null}
        </Pressable>
      </Animated.View>

      {active && isVideo && paused ? (
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          className="items-center justify-center"
        >
          <View className="h-16 w-16 items-center justify-center rounded-full bg-black/50">
            <Icon name="play" size={30} color="#fff" />
          </View>
        </View>
      ) : null}

      <Animated.View
        pointerEvents={commentsOpen ? "none" : "box-none"}
        style={[StyleSheet.absoluteFill, chromeStyle]}
      >
        {/* Legibility scrims behind the header and the details. */}
        <Scrim edge="top" height={topInset + 64} width={width} />
        <Scrim edge="bottom" height={height * 0.42} width={width} />

        {/* Sponsored disclosure (left) and sound (right), under the header */}
        <View
          style={{
            position: "absolute",
            top: topInset + 8,
            left: 12,
            right: 12,
          }}
          className="flex-row items-center justify-between"
          pointerEvents="box-none"
        >
          {sponsored ? (
            <View className="rounded bg-white/90 px-1.5 py-0.5">
              <AppText className="text-[11px] font-bold uppercase text-black">
                {SPONSORED_LABEL}
              </AppText>
            </View>
          ) : (
            <View />
          )}
          {isVideo ? (
            <Pressable
              onPress={toggleSpotlightMuted}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={muted ? "Turn sound on" : "Turn sound off"}
              className="h-10 w-10 items-center justify-center rounded-full bg-black/35"
            >
              <Icon
                name={muted ? "volume-mute" : "volume-high"}
                size={19}
                color="#fff"
              />
            </Pressable>
          ) : null}
        </View>

        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: bottomInset,
          }}
          pointerEvents="box-none"
        >
          <View className="flex-row items-end" pointerEvents="box-none">
            {/* Creator + caption */}
            <View className="flex-1 gap-2 pb-1 pl-3 pr-2">
              <View className="flex-row items-center gap-2.5">
                <Pressable
                  disabled={!profileHref}
                  onPress={openProfile}
                  hitSlop={6}
                  accessibilityRole={profileHref ? "link" : undefined}
                  accessibilityLabel={`${name}, open profile`}
                  className="rounded-full border-[1.5px] border-white"
                >
                  <Avatar
                    publicId={post.publisher.avatarPublicId}
                    version={post.publisher.avatarVersion}
                    size={38}
                  />
                </Pressable>
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      disabled={!profileHref}
                      onPress={openProfile}
                      hitSlop={{ top: 8, bottom: 8 }}
                      accessibilityRole={profileHref ? "link" : undefined}
                      accessibilityLabel={`${name}, open profile`}
                      className="shrink flex-row items-center gap-1"
                    >
                      <AppText
                        numberOfLines={1}
                        className="shrink text-[15px] font-bold text-white"
                        style={textShadow}
                      >
                        {name}
                      </AppText>
                      {post.publisher.verified ? (
                        <Icon name="checkmark-circle" size={14} color="#fff" />
                      ) : null}
                    </Pressable>
                    {followTarget && !post.viewer.isAuthor ? (
                      <FollowButton
                        kind={followTarget}
                        targetId={post.publisher.id}
                        ownerId={post.publisher.ownerId ?? post.authorId}
                        label={post.publisher.name}
                        known={post.viewer.following}
                        onMedia
                        inline
                      />
                    ) : null}
                  </View>
                  <AppText
                    className="text-[12px] text-white/75"
                    style={textShadow}
                  >
                    {formatStoryAge(post.publishedAt)}
                  </AppText>
                </View>
              </View>
              {post.caption ? (
                <Pressable
                  onPress={() => setExpanded((v) => !v)}
                  accessibilityRole="button"
                  accessibilityHint={
                    expanded
                      ? "Shows less of the caption"
                      : "Shows the full caption"
                  }
                >
                  <AppText
                    numberOfLines={expanded ? 8 : 2}
                    className="text-[14px] leading-5 text-white"
                    style={textShadow}
                  >
                    {post.caption}
                  </AppText>
                </Pressable>
              ) : null}
            </View>

            {/* Action rail */}
            <View className="w-[68px] items-center gap-3.5 pb-1">
              <RailButton
                icon={engagement.liked ? "heart" : "heart-outline"}
                color={engagement.liked ? "#ff3b5c" : "#fff"}
                label={engagement.liked ? "Unlike" : "Like"}
                count={engagement.counts.likes}
                selected={engagement.liked}
                onPress={() => {
                  hapticLight();
                  engagement.toggleLike();
                }}
              />
              {post.allowComments ? (
                <RailButton
                  icon="chatbubble-ellipses-outline"
                  label="Comments"
                  count={engagement.counts.comments}
                  onPress={openComments}
                />
              ) : null}
              <RailButton
                icon="paper-plane-outline"
                label="Share"
                count={engagement.counts.shares}
                onPress={share}
              />
              <RailButton
                icon={engagement.saved ? "bookmark" : "bookmark-outline"}
                color={engagement.saved ? "#ffc53d" : "#fff"}
                label={engagement.saved ? "Remove from saved" : "Save"}
                count={engagement.counts.saves}
                selected={engagement.saved}
                onPress={() => {
                  hapticLight();
                  engagement.toggleSave();
                }}
              />
              {post.viewer.isAuthor ? (
                <RailButton
                  icon="stats-chart"
                  label="Insights"
                  caption="Insights"
                  onPress={() =>
                    router.push(`/(app)/spotlight/post/${post.id}`)
                  }
                />
              ) : null}
              <RailButton
                icon="ellipsis-horizontal"
                label="More options"
                onPress={() => setOptionsOpen(true)}
              />
            </View>
          </View>

          <View className="px-3 pt-3" pointerEvents="box-none">
            <ContentCta post={post} campaignId={campaignId} />
          </View>
        </View>
      </Animated.View>

      {commentsMounted ? (
        <SpotlightCommentsPanel
          postId={post.id}
          progress={progress}
          panelHeight={panelHeight}
          bottomObstruction={bottomObstruction}
          commentsAllowed={post.allowComments}
          commentCount={engagement.counts.comments}
          onClose={closeComments}
          onCountChange={(delta) =>
            engagement.setCounts((c) => ({
              ...c,
              comments: Math.max(0, c.comments + delta),
            }))
          }
        />
      ) : null}

      <ContentOptionsSheet
        post={post}
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        saved={engagement.saved}
        onToggleSave={engagement.toggleSave}
        onShare={share}
        onNotInterested={() => engagement.markNotInterested(true)}
        onDeleted={() => onHide?.(post.id)}
      />
    </View>
  );
});

const textShadow = {
  textShadowColor: "rgba(0,0,0,0.45)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
};

function Scrim({
  edge,
  height,
  width,
}: {
  edge: "top" | "bottom";
  height: number;
  width: number;
}) {
  const id = `spotlight-scrim-${edge}`;
  return (
    <Svg
      pointerEvents="none"
      width={width}
      height={height}
      style={{ position: "absolute", left: 0, [edge]: 0 }}
    >
      <Defs>
        <LinearGradient
          id={id}
          x1="0"
          y1={edge === "top" ? "0" : "1"}
          x2="0"
          y2={edge === "top" ? "1" : "0"}
        >
          <Stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#000" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

function RailButton({
  icon,
  label,
  count,
  caption,
  color = "#fff",
  selected,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  count?: number;
  /** A word under the icon instead of a count. */
  caption?: string;
  color?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const text = caption ?? (count !== undefined ? compact(count) : null);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={
        count !== undefined ? `${label}, ${count.toLocaleString()}` : label
      }
      accessibilityState={selected === undefined ? undefined : { selected }}
      className="min-h-[48px] w-[56px] items-center justify-center active:opacity-60"
    >
      <View style={iconShadow}>
        <Icon name={icon} size={29} color={color} />
      </View>
      {text !== null ? (
        <AppText
          numberOfLines={1}
          className="mt-0.5 text-[12px] font-semibold text-white"
          style={textShadow}
        >
          {text}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const iconShadow = {
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
};
