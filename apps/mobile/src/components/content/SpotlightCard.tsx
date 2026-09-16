import {
  publisherRoute,
  shareContent,
  useRequireSignIn,
} from "@/features/content/contentLinks";
import { usePostEngagement } from "@/features/content/useContent";
import {
  trackContentClick,
  usePlaySession,
} from "@/features/content/useContentTelemetry";
import { hapticLight } from "@/lib/haptics";
import { SPONSORED_LABEL } from "@abonten/core/content/copy";
import { formatStoryAge } from "@abonten/core/content/storyExpiry";
import type {
  ContentFeedItem,
  ContentViewSurface,
} from "@abonten/types/contentType";
import { AppText, Avatar, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { type VideoPlayer, VideoView } from "expo-video";
import { memo, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ContentCommentsSheet } from "./ContentCommentsSheet";
import { ContentCta } from "./ContentCta";
import { ContentOptionsSheet } from "./ContentOptionsSheet";
import { FollowButton } from "./FollowButton";

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/**
 * One full-height Spotlight page. The feed owns a single video player and
 * hands it only to the active card; every other card shows its poster, so
 * scrolling never holds more than one decoder.
 */
export const SpotlightCard = memo(function SpotlightCard({
  item,
  active,
  height,
  player,
  muted,
  onToggleMute,
  surface,
  onHide,
  holdPlayback,
}: {
  item: ContentFeedItem;
  active: boolean;
  height: number;
  player: VideoPlayer;
  muted: boolean;
  onToggleMute: () => void;
  surface: ContentViewSurface;
  onHide?: (postId: string) => void;
  /** Pause while something on top (a sheet) is open. */
  holdPlayback?: (held: boolean) => void;
}) {
  const { post, sponsored } = item;
  const campaignId = sponsored?.campaignId ?? null;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireSignIn = useRequireSignIn();
  const engagement = usePostEngagement(post, requireSignIn);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lastTime = useRef(0);

  const media = post.media[0];
  const isVideo = media?.type === "video";
  const poster = isVideo
    ? (media.posterUrl ?? media.thumbnailUrl)
    : media?.mediaUrl;

  const play = usePlaySession({
    postId: post.id,
    surface,
    campaignId,
    active,
    durationMs:
      isVideo && media?.durationSeconds ? media.durationSeconds * 1000 : null,
  });

  const held = optionsOpen || commentsOpen;
  useEffect(() => {
    if (active) holdPlayback?.(held);
  }, [active, held, holdPlayback]);

  // The poster stays only until the video draws its first frame: a poster
  // left underneath shows through the letterbox of a video whose shape
  // differs from it.
  const [firstFrame, setFirstFrame] = useState(false);
  useEffect(() => {
    if (!active) {
      setPaused(false);
      setFirstFrame(false);
    }
  }, [active]);

  // Images count as watched while their page is on screen.
  useEffect(() => {
    if (!active || isVideo) return;
    if (held) play.onPaused();
    else play.onPlaying();
    return () => play.onPaused();
  }, [active, isVideo, held, play]);

  useEffect(() => {
    if (!active || !isVideo) return;
    let subs: { remove: () => void }[] = [];
    try {
      subs = [
        player.addListener("playingChange", ({ isPlaying }) => {
          if (isPlaying) play.onPlaying();
          else play.onPaused();
        }),
        player.addListener("timeUpdate", ({ currentTime }) => {
          if (currentTime + 0.5 < lastTime.current) {
            play.onEnded();
            play.onLoop();
          }
          lastTime.current = currentTime;
        }),
      ];
    } catch {
      // player released
    }
    return () => {
      for (const s of subs) {
        try {
          s.remove();
        } catch {}
      }
    };
  }, [active, isVideo, player, play]);

  const togglePause = () => {
    if (!isVideo || !active) return;
    hapticLight();
    try {
      if (paused) player.play();
      else player.pause();
    } catch {}
    setPaused((v) => !v);
  };

  if (engagement.notInterested) {
    return (
      <View
        style={{ height }}
        className="items-center justify-center gap-3 bg-black px-8"
      >
        <AppText className="text-center text-white">
          Thanks. You'll see fewer posts like this.
        </AppText>
        <Pressable onPress={() => engagement.markNotInterested(false)}>
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

  return (
    <View style={{ height }} className="bg-black">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={togglePause}
        onLongPress={() => setOptionsOpen(true)}
        accessibilityLabel={isVideo ? "Play or pause" : "Spotlight photo"}
      >
        {poster && !(active && isVideo && firstFrame) ? (
          <Image
            source={{ uri: poster }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={120}
          />
        ) : null}
        {active && isVideo ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            nativeControls={false}
            onFirstFrameRender={() => setFirstFrame(true)}
          />
        ) : null}
      </Pressable>

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

      {/* Top right: sound + more; sponsored disclosure on the left */}
      <View
        style={{
          position: "absolute",
          top: insets.top + 56,
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
        <View className="flex-row items-center gap-2">
          {isVideo ? (
            <Pressable
              onPress={onToggleMute}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={muted ? "Turn sound on" : "Turn sound off"}
              className="h-9 w-9 items-center justify-center rounded-full bg-black/40"
            >
              <Icon
                name={muted ? "volume-mute" : "volume-high"}
                size={18}
                color="#fff"
              />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setOptionsOpen(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="More options"
            className="h-9 w-9 items-center justify-center rounded-full bg-black/40"
          >
            <Icon name="ellipsis-horizontal" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Action rail */}
      <View
        style={{ position: "absolute", right: 8, bottom: insets.bottom + 150 }}
        className="items-center gap-5"
      >
        <RailButton
          icon={engagement.liked ? "heart" : "heart-outline"}
          color={engagement.liked ? "#ef4444" : "#fff"}
          label={engagement.liked ? "Unlike" : "Like"}
          count={engagement.counts.likes}
          onPress={() => {
            hapticLight();
            engagement.toggleLike();
          }}
        />
        {post.allowComments ? (
          <RailButton
            icon="chatbubble-outline"
            label="Comments"
            count={engagement.counts.comments}
            onPress={() => setCommentsOpen(true)}
          />
        ) : null}
        <RailButton
          icon="paper-plane-outline"
          label="Share"
          count={engagement.counts.shares}
          onPress={async () => {
            const outcome = await shareContent(post);
            if (outcome.kind === "shared") engagement.recordShare("native");
          }}
        />
        <RailButton
          icon={engagement.saved ? "bookmark" : "bookmark-outline"}
          label={engagement.saved ? "Remove from saved" : "Save"}
          onPress={engagement.toggleSave}
        />
      </View>

      {/* Details */}
      <View
        style={{
          position: "absolute",
          left: 12,
          right: 64,
          bottom: insets.bottom + 16,
        }}
        className="gap-2"
      >
        <View className="flex-row items-center gap-2">
          <Pressable
            disabled={!profileHref}
            onPress={() => {
              if (!profileHref) return;
              trackContentClick(post.id, "profile", campaignId);
              router.push(profileHref as never);
            }}
            className="flex-1 flex-row items-center gap-2"
          >
            <Avatar
              publicId={post.publisher.avatarPublicId}
              version={post.publisher.avatarVersion}
              size={36}
            />
            <View className="flex-1">
              <View className="flex-row items-center gap-1">
                <AppText
                  numberOfLines={1}
                  className="text-[14px] font-semibold text-white"
                >
                  {post.publisher.kind === "organizer" &&
                  post.publisher.username
                    ? post.publisher.username
                    : post.publisher.name}
                </AppText>
                {post.publisher.verified ? (
                  <Icon name="checkmark-circle" size={14} color="#fff" />
                ) : null}
              </View>
              <AppText className="text-[12px] text-white/75">
                {formatStoryAge(post.publishedAt)}
              </AppText>
            </View>
          </Pressable>
          {followTarget && !post.viewer.isAuthor ? (
            <FollowButton
              kind={followTarget}
              targetId={post.publisher.id}
              ownerId={post.publisher.ownerId ?? post.authorId}
              label={post.publisher.name}
              known={post.viewer.following}
              onMedia
            />
          ) : null}
        </View>
        {post.caption ? (
          <Pressable onPress={() => setExpanded((v) => !v)}>
            <AppText
              numberOfLines={expanded ? undefined : 2}
              className="text-[14px] text-white"
            >
              {post.caption}
            </AppText>
          </Pressable>
        ) : null}
        <ContentCta post={post} campaignId={campaignId} />
      </View>

      <ContentOptionsSheet
        post={post}
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        onNotInterested={() => engagement.markNotInterested(true)}
        onDeleted={() => onHide?.(post.id)}
      />
      {commentsOpen ? (
        <ContentCommentsSheet
          postId={post.id}
          open
          onClose={() => setCommentsOpen(false)}
          commentsAllowed={post.allowComments}
          onCountChange={(delta) =>
            engagement.setCounts((c) => ({
              ...c,
              comments: Math.max(0, c.comments + delta),
            }))
          }
        />
      ) : null}
    </View>
  );
});

function RailButton({
  icon,
  label,
  count,
  color = "#fff",
  onPress,
}: {
  icon:
    | "heart"
    | "heart-outline"
    | "chatbubble-outline"
    | "paper-plane-outline"
    | "bookmark"
    | "bookmark-outline";
  label: string;
  count?: number;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="items-center"
    >
      <Icon name={icon} size={30} color={color} />
      {count !== undefined ? (
        <AppText className="text-[12px] font-semibold text-white">
          {compact(count)}
        </AppText>
      ) : null}
    </Pressable>
  );
}
