"use client";

import { cn } from "@/components/lib/utils";
import { useToast } from "@/hooks/useToast";
import { formatStoryAge } from "@abonten/core/content/storyExpiry";
import type {
  ContentFeedItem,
  ContentMediaItem,
  ContentViewSurface,
} from "@abonten/types/contentType";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IoBookmark,
  IoBookmarkOutline,
  IoChatbubbleOutline,
  IoChevronBack,
  IoChevronForward,
  IoHeart,
  IoHeartOutline,
  IoPaperPlaneOutline,
  IoPlay,
  IoVolumeHighOutline,
  IoVolumeMuteOutline,
} from "react-icons/io5";
import PublisherIdentity from "../atoms/PublisherIdentity";
import SponsoredBadge from "../atoms/SponsoredBadge";
import {
  trackContentClick,
  usePlaySession,
} from "../hooks/useContentTelemetry";
import { useMutedPreference } from "../hooks/useMutedPreference";
import { usePostEngagement } from "../hooks/usePostEngagement";
import { shareContent } from "../lib/share";
import ContentCaption from "../molecules/ContentCaption";
import ContentCtaButton from "../molecules/ContentCtaButton";
import ContentMoreMenu from "../molecules/ContentMoreMenu";
import FollowButton from "../molecules/FollowButton";
import ContentCommentsSheet from "./ContentCommentsSheet";

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function videoSource(media: ContentMediaItem): string {
  return media.playbackStatus === "ready" && media.playbackUrl
    ? media.playbackUrl
    : media.mediaUrl;
}

/**
 * One full-height Spotlight. Only the active card plays; everything else is
 * paused and releases its decoder by dropping the video source, so a long
 * feed never holds more than one playing video.
 */
export default function SpotlightCard({
  item,
  active,
  surface,
  onHide,
  className,
}: {
  item: ContentFeedItem;
  active: boolean;
  surface: ContentViewSurface;
  /** The visitor chose "Not interested" or deleted their own post. */
  onHide?: () => void;
  className?: string;
}) {
  const { post, sponsored } = item;
  const campaignId = sponsored?.campaignId ?? null;
  const toast = useToast();
  const engagement = usePostEngagement(post);
  const [muted, setMuted] = useMutedPreference();
  const [mediaIndex, setMediaIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastTime = useRef(0);

  const media = post.media[mediaIndex] ?? post.media[0];
  const isVideo = media?.type === "video";
  const held = menuOpen || commentsOpen;
  const shouldPlay = active && !userPaused && !held;

  const play = usePlaySession({
    postId: post.id,
    surface,
    campaignId,
    active,
    durationMs:
      isVideo && media?.durationSeconds ? media.durationSeconds * 1000 : null,
  });

  // Images count as "playing" while the card is active and not held.
  useEffect(() => {
    if (isVideo) return;
    if (shouldPlay) play.onPlaying();
    else play.onPaused();
  }, [isVideo, shouldPlay, play]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    if (shouldPlay) {
      video.play().catch(() => {
        // Autoplay was refused; the play overlay stays visible.
        setUserPaused(true);
      });
    } else {
      video.pause();
    }
  }, [shouldPlay, isVideo]);

  useEffect(() => {
    if (!active) {
      setUserPaused(false);
      setCommentsOpen(false);
    }
  }, [active]);

  const togglePlay = useCallback(() => setUserPaused((v) => !v), []);

  // Keyboard controls for the active card: Space/K play-pause, M sound,
  // L like, C comments. Arrow keys are handled by the feed.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (held) return;
      const key = e.key.toLowerCase();
      if (key === " " || key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (key === "m") {
        setMuted(!muted);
      } else if (key === "l") {
        engagement.toggleLike();
      } else if (key === "c" && post.allowComments) {
        setCommentsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    active,
    held,
    muted,
    setMuted,
    togglePlay,
    engagement,
    post.allowComments,
  ]);

  if (engagement.notInterested) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-3 bg-black text-center text-white",
          className,
        )}
      >
        <p className="text-sm">Thanks. You'll see fewer posts like this.</p>
        <button
          type="button"
          onClick={() => engagement.markNotInterested(false)}
          className="text-sm font-semibold underline"
        >
          Undo
        </button>
      </div>
    );
  }

  const share = async () => {
    const channel = await shareContent(
      post.kind,
      post.id,
      post.caption?.slice(0, 80) || "Spotlight on Abonten",
    );
    if (!channel) return;
    if (channel === "copy_link") toast.success("Link copied.");
    engagement.recordShare(channel);
  };

  const publisherTarget =
    post.publisher.kind === "place"
      ? { kind: "place" as const, id: post.publisher.id }
      : post.publisher.kind === "organizer"
        ? { kind: "organizer" as const, id: post.publisher.id }
        : null;

  return (
    <article
      aria-label={`Spotlight by ${post.publisher.name}`}
      className={cn(
        "relative h-full w-full overflow-hidden bg-black",
        className,
      )}
    >
      {/* Media */}
      <div className="absolute inset-0">
        {media ? (
          isVideo && !videoFailed ? (
            // biome-ignore lint/a11y/useKeyWithClickEvents: Space and K toggle playback for the active card from the keyboard
            <video
              ref={videoRef}
              // Dropping the source when inactive releases the decoder.
              src={active ? videoSource(media) : undefined}
              poster={media.posterUrl ?? media.thumbnailUrl ?? undefined}
              muted={muted}
              loop
              playsInline
              preload={active ? "auto" : "none"}
              className="h-full w-full object-contain"
              onClick={togglePlay}
              onPlaying={play.onPlaying}
              onPause={play.onPaused}
              onWaiting={play.onPaused}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                if (t + 0.5 < lastTime.current) {
                  play.onEnded();
                  play.onLoop();
                }
                lastTime.current = t;
              }}
              onError={() => {
                if (
                  media.playbackUrl &&
                  videoRef.current?.src !== media.mediaUrl
                ) {
                  if (videoRef.current) videoRef.current.src = media.mediaUrl;
                } else {
                  setVideoFailed(true);
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={togglePlay}
              className="relative block h-full w-full"
              aria-label="Pause or play"
            >
              <Image
                src={
                  isVideo
                    ? (media.posterUrl ?? media.thumbnailUrl ?? media.mediaUrl)
                    : media.mediaUrl
                }
                alt={post.caption?.slice(0, 120) ?? ""}
                fill
                sizes="(max-width: 768px) 100vw, 480px"
                className="object-contain"
                priority={active}
              />
              {videoFailed ? (
                <span className="absolute inset-x-0 bottom-1/2 text-center text-sm text-white/80">
                  This video can't play right now.
                </span>
              ) : null}
            </button>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/70">
            Media unavailable
          </div>
        )}
      </div>

      {/* Gradients for legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/80 to-transparent" />

      {isVideo && userPaused && active ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 p-5 text-white"
        >
          <IoPlay className="text-4xl" />
        </button>
      ) : null}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <div>{sponsored ? <SponsoredBadge /> : null}</div>
        <div className="flex items-center gap-1">
          {isVideo ? (
            <button
              type="button"
              onClick={() => setMuted(!muted)}
              aria-label={muted ? "Turn sound on" : "Turn sound off"}
              className="rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            >
              {muted ? (
                <IoVolumeMuteOutline className="text-lg" />
              ) : (
                <IoVolumeHighOutline className="text-lg" />
              )}
            </button>
          ) : null}
          <ContentMoreMenu
            post={post}
            onOpenChange={setMenuOpen}
            onNotInterested={() => engagement.markNotInterested(true)}
            onDeleted={onHide}
          />
        </div>
      </div>

      {/* Multi-item navigation */}
      {post.media.length > 1 ? (
        <>
          {mediaIndex > 0 ? (
            <button
              type="button"
              aria-label="Previous photo or video"
              onClick={() => setMediaIndex((i) => Math.max(0, i - 1))}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white"
            >
              <IoChevronBack />
            </button>
          ) : null}
          {mediaIndex < post.media.length - 1 ? (
            <button
              type="button"
              aria-label="Next photo or video"
              onClick={() =>
                setMediaIndex((i) => Math.min(post.media.length - 1, i + 1))
              }
              className="absolute right-14 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white"
            >
              <IoChevronForward />
            </button>
          ) : null}
          <div className="absolute inset-x-0 top-14 flex justify-center gap-1">
            {post.media.map((m, i) => (
              <span
                key={m.id}
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  i === mediaIndex ? "bg-white" : "bg-white/40",
                )}
              />
            ))}
          </div>
        </>
      ) : null}

      {/* Action rail */}
      <div className="absolute bottom-28 right-2 flex flex-col items-center gap-4 text-white">
        <RailButton
          label={engagement.liked ? "Unlike" : "Like"}
          pressed={engagement.liked}
          onClick={engagement.toggleLike}
          count={engagement.counts.likes}
        >
          {engagement.liked ? (
            <IoHeart className="text-3xl text-red-500" />
          ) : (
            <IoHeartOutline className="text-3xl" />
          )}
        </RailButton>
        {post.allowComments ? (
          <RailButton
            label="Comments"
            onClick={() => setCommentsOpen(true)}
            count={engagement.counts.comments}
          >
            <IoChatbubbleOutline className="text-3xl" />
          </RailButton>
        ) : null}
        <RailButton
          label="Share"
          onClick={share}
          count={engagement.counts.shares}
        >
          <IoPaperPlaneOutline className="text-3xl" />
        </RailButton>
        <RailButton
          label={engagement.saved ? "Remove from saved" : "Save"}
          pressed={engagement.saved}
          onClick={engagement.toggleSave}
        >
          {engagement.saved ? (
            <IoBookmark className="text-3xl" />
          ) : (
            <IoBookmarkOutline className="text-3xl" />
          )}
        </RailButton>
      </div>

      {/* Bottom details */}
      <div className="absolute inset-x-0 bottom-0 space-y-2 p-3 pr-16">
        <div className="flex items-center gap-2">
          <PublisherIdentity
            publisher={post.publisher}
            subtitle={formatStoryAge(post.publishedAt)}
            onNavigate={() => trackContentClick(post.id, "profile", campaignId)}
          />
          {publisherTarget && !post.viewer.isAuthor ? (
            <FollowButton
              kind={publisherTarget.kind}
              targetId={publisherTarget.id}
              ownerId={post.publisher.ownerId ?? post.authorId}
              label={post.publisher.name}
              known={post.viewer.following}
              variant="overlay"
              className="px-2.5 py-1 text-xs"
            />
          ) : null}
        </div>
        <ContentCaption caption={post.caption} />
        <ContentCtaButton post={post} campaignId={campaignId} />
      </div>

      {commentsOpen ? (
        <ContentCommentsSheet
          postId={post.id}
          open
          onOpenChange={setCommentsOpen}
          commentsAllowed={post.allowComments}
          onCountChange={(delta) =>
            engagement.setCounts((c) => ({
              ...c,
              comments: Math.max(0, c.comments + delta),
            }))
          }
        />
      ) : null}
    </article>
  );
}

function RailButton({
  label,
  onClick,
  pressed,
  count,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className="flex flex-col items-center gap-0.5 drop-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
    >
      {children}
      {count !== undefined ? (
        <span className="text-xs font-semibold">{compact(count)}</span>
      ) : null}
    </button>
  );
}
