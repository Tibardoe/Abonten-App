"use client";

import { getStorySequence } from "@/actions/content/getStorySequence";
import { setStoryMute } from "@/actions/content/setStoryMute";
import ModalShell from "@/components/atoms/ModalShell";
import { cn } from "@/components/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/useToast";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IoChatbubbleOutline,
  IoClose,
  IoEyeOutline,
  IoPaperPlaneOutline,
  IoPause,
  IoPlay,
  IoVolumeHighOutline,
  IoVolumeMuteOutline,
} from "react-icons/io5";
import PublisherIdentity from "../atoms/PublisherIdentity";
import { useContentProgram } from "../hooks/useContentProgram";
import {
  flushContentViews,
  usePlaySession,
} from "../hooks/useContentTelemetry";
import { useMutedPreference } from "../hooks/useMutedPreference";
import { usePostEngagement } from "../hooks/usePostEngagement";
import { publisherLabel } from "../lib/publisher";
import { dataOf, messageOf } from "../lib/result";
import { shareContent } from "../lib/share";
import ContentCtaButton from "../molecules/ContentCtaButton";
import ContentMoreMenu from "../molecules/ContentMoreMenu";
import ContentCommentsSheet from "./ContentCommentsSheet";

export type StoryQueueEntry = {
  publisherKind: ContentPublisherKind;
  publisherId: string;
};

/**
 * Full-screen Story player. Walks one publisher's live Stories in order,
 * then moves on to the next publisher in the queue. Tap the right side for
 * next, the left for previous, hold to pause; ← → and Space work too.
 */
export default function StoryViewer({
  queue,
  startIndex = 0,
  startStoryId,
  onClose,
}: {
  queue: StoryQueueEntry[];
  startIndex?: number;
  startStoryId?: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [entryIndex, setEntryIndex] = useState(startIndex);
  const entry = queue[entryIndex];

  const close = useCallback(() => {
    flushContentViews().finally(() => {
      qc.invalidateQueries({ queryKey: ["content", "stories", "tray"] });
    });
    onClose();
  }, [onClose, qc]);

  const sequence = useQuery({
    queryKey: [
      "content",
      "stories",
      "sequence",
      entry?.publisherKind,
      entry?.publisherId,
    ],
    enabled: !!entry,
    queryFn: async () => {
      const res = await getStorySequence(entry);
      const data = dataOf(res);
      if (!data) throw new Error(messageOf(res));
      return data;
    },
    staleTime: 30_000,
  });

  const nextEntry = useCallback(() => {
    if (entryIndex + 1 < queue.length) setEntryIndex(entryIndex + 1);
    else close();
  }, [close, entryIndex, queue.length]);

  const prevEntry = useCallback(() => {
    if (entryIndex > 0) setEntryIndex(entryIndex - 1);
  }, [entryIndex]);

  return (
    <ModalShell
      open
      onClose={close}
      title="Stories"
      overlayClassName="bg-black/95"
      className="fixed inset-0 z-50 flex items-center justify-center outline-none"
    >
      <div className="relative h-full w-full max-w-[480px] overflow-hidden bg-black md:h-[92dvh] md:rounded-2xl">
        {sequence.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/70" />
          </div>
        ) : sequence.isError || !sequence.data ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white">
            <p className="text-sm">Couldn't load these Stories.</p>
            <button
              type="button"
              onClick={nextEntry}
              className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black"
            >
              Continue
            </button>
          </div>
        ) : (
          <StorySequencePlayer
            key={`${entry?.publisherKind}:${entry?.publisherId}`}
            stories={sequence.data.stories}
            startStoryId={entryIndex === startIndex ? startStoryId : null}
            onFinished={nextEntry}
            onBeforeFirst={prevEntry}
            onClose={close}
            publisherKind={entry.publisherKind}
            publisherId={entry.publisherId}
          />
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Close Stories"
          className="absolute right-2 top-7 z-30 rounded-full p-2 text-white hover:bg-white/10"
        >
          <IoClose className="text-2xl" />
        </button>
      </div>
    </ModalShell>
  );
}

function StorySequencePlayer({
  stories: initialStories,
  startStoryId,
  onFinished,
  onBeforeFirst,
  onClose,
  publisherKind,
  publisherId,
}: {
  stories: ContentPostDocument[];
  startStoryId?: string | null;
  onFinished: () => void;
  onBeforeFirst: () => void;
  onClose: () => void;
  publisherKind: ContentPublisherKind;
  publisherId: string;
}) {
  // A Story that expires while the viewer is open is skipped, not shown.
  // Each media item of a Story is its own slide.
  const [stories, setStories] = useState(() =>
    initialStories.filter((s) => s.viewer.isAuthor || isStoryActive(s)),
  );
  const slides = stories.flatMap((story) =>
    story.media.map((_, mediaIndex) => ({ story, mediaIndex })),
  );
  const [index, setIndex] = useState(() => {
    const target = startStoryId
      ? slides.findIndex((sl) => sl.story.id === startStoryId)
      : slides.findIndex((sl) => !sl.story.viewer.seen);
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
      story={slide.story}
      mediaIndex={slide.mediaIndex}
      index={index}
      total={slides.length}
      onNext={() =>
        index + 1 < slides.length ? setIndex(index + 1) : onFinished()
      }
      onPrev={() => (index > 0 ? setIndex(index - 1) : onBeforeFirst())}
      onRemoved={() => {
        const removedId = slide.story.id;
        const firstOfStory = slides.findIndex(
          (sl) => sl.story.id === removedId,
        );
        setStories((prev) => prev.filter((st) => st.id !== removedId));
        setIndex(Math.max(0, firstOfStory));
      }}
      onClose={onClose}
      publisherKind={publisherKind}
      publisherId={publisherId}
    />
  );
}

function StorySlide({
  story,
  mediaIndex,
  index,
  total,
  onNext,
  onPrev,
  onRemoved,
  onClose,
  publisherKind,
  publisherId,
}: {
  story: ContentPostDocument;
  mediaIndex: number;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onRemoved: () => void;
  onClose: () => void;
  publisherKind: ContentPublisherKind;
  publisherId: string;
}) {
  const { program } = useContentProgram();
  const { data: user } = useCurrentUser();
  const toast = useToast();
  const engagement = usePostEngagement(story);
  const [muted, setMuted] = useMutedPreference();
  const [userPaused, setUserPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHold = useRef(false);

  const media = story.media[mediaIndex] ?? story.media[0];
  const isVideo = media?.type === "video";
  const paused = userPaused || holding || menuOpen || commentsOpen || !loaded;
  const isAuthor = story.viewer.isAuthor;

  const play = usePlaySession({
    postId: story.id,
    surface: "stories",
    active: true,
    durationMs: isVideo ? (media?.durationSeconds ?? 0) * 1000 || null : null,
  });

  // Images advance after a fixed dwell; videos follow their own clock.
  useEffect(() => {
    if (isVideo || paused) {
      play.onPaused();
      return;
    }
    play.onPlaying();
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      setProgress((p) => {
        const next = p + delta / IMAGE_DWELL_MS;
        return next >= 1 ? 1 : next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isVideo, paused, play]);

  useEffect(() => {
    if (!isVideo && progress >= 1) {
      play.onEnded();
      onNext();
    }
  }, [isVideo, progress, onNext, play]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    if (paused && loaded) video.pause();
    else if (!paused) video.play().catch(() => setUserPaused(true));
  }, [paused, isVideo, loaded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (commentsOpen || menuOpen) return;
      if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === " ") {
        e.preventDefault();
        setUserPaused((v) => !v);
      } else if (e.key.toLowerCase() === "m") setMuted(!muted);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commentsOpen, menuOpen, muted, onNext, onPrev, setMuted]);

  const startHold = () => {
    didHold.current = false;
    holdTimer.current = setTimeout(() => {
      didHold.current = true;
      setHolding(true);
    }, 200);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setHolding(false);
  };
  const tapZone = (zone: "prev" | "next") => {
    if (didHold.current) {
      didHold.current = false;
      return;
    }
    if (zone === "next") onNext();
    else onPrev();
  };

  const muteStories = async () => {
    const res = await setStoryMute({ publisherKind, publisherId, muted: true });
    if (res.status !== 200) {
      toast.error(messageOf(res, "Couldn't mute these Stories."));
      return;
    }
    toast.success(`Stories from ${publisherLabel(story.publisher)} muted.`);
    onClose();
  };

  const share = async () => {
    const channel = await shareContent("story", story.id, "Story on Abonten");
    if (!channel) return;
    if (channel === "copy_link") toast.success("Link copied.");
    engagement.recordShare(channel);
  };

  const canReact = !isAuthor && !!user && program.storiesReactions;
  const canComment = program.storiesComments && story.allowComments;

  return (
    <div className="relative h-full w-full select-none">
      {/* Media */}
      <div className="absolute inset-0 flex items-center justify-center">
        {media ? (
          isVideo ? (
            <video
              ref={videoRef}
              src={
                media.playbackStatus === "ready" && media.playbackUrl
                  ? media.playbackUrl
                  : media.mediaUrl
              }
              poster={media.posterUrl ?? media.thumbnailUrl ?? undefined}
              muted={muted}
              playsInline
              preload="auto"
              className="h-full w-full object-contain"
              onLoadedData={() => setLoaded(true)}
              onPlaying={play.onPlaying}
              onPause={play.onPaused}
              onWaiting={play.onPaused}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration > 0) setProgress(v.currentTime / v.duration);
              }}
              onEnded={() => {
                play.onEnded();
                onNext();
              }}
              onError={() => {
                setLoaded(true);
                onNext();
              }}
            />
          ) : (
            <Image
              src={media.mediaUrl}
              alt={story.caption?.slice(0, 120) ?? "Story"}
              fill
              sizes="480px"
              className="object-contain"
              priority
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
            />
          )
        ) : null}
        {!loaded ? (
          <Loader2 className="absolute h-6 w-6 animate-spin text-white/70" />
        ) : null}
      </div>

      {/* Tap zones: left third back, the rest forward; hold anywhere pauses */}
      <div className="absolute inset-0 z-10 flex">
        <button
          type="button"
          aria-label="Previous Story"
          className="h-full w-1/3 cursor-default"
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onClick={() => tapZone("prev")}
        />
        <button
          type="button"
          aria-label="Next Story"
          className="h-full w-2/3 cursor-default"
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onClick={() => tapZone("next")}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-48 bg-gradient-to-t from-black/70 to-transparent" />

      {/* Header */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-20 space-y-2 p-3 transition-opacity",
          holding ? "opacity-0" : "opacity-100",
        )}
      >
        <div className="flex gap-1">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={`bar-${i.toString()}`}
              className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/40"
            >
              <span
                className="block h-full bg-white"
                style={{
                  width:
                    i < index
                      ? "100%"
                      : i === index
                        ? `${Math.round(progress * 100)}%`
                        : "0%",
                }}
              />
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between pr-10">
          <PublisherIdentity
            publisher={story.publisher}
            size={32}
            subtitle={formatStoryAge(story.publishedAt)}
            onNavigate={onClose}
            className="pointer-events-auto"
          />
          <div className="pointer-events-auto flex items-center">
            <button
              type="button"
              onClick={() => setUserPaused((v) => !v)}
              aria-label={userPaused ? "Play" : "Pause"}
              className="rounded-full p-2 text-white hover:bg-white/10"
            >
              {userPaused ? <IoPlay /> : <IoPause />}
            </button>
            {isVideo ? (
              <button
                type="button"
                onClick={() => setMuted(!muted)}
                aria-label={muted ? "Turn sound on" : "Turn sound off"}
                className="rounded-full p-2 text-white hover:bg-white/10"
              >
                {muted ? <IoVolumeMuteOutline /> : <IoVolumeHighOutline />}
              </button>
            ) : null}
            <ContentMoreMenu
              post={story}
              onOpenChange={setMenuOpen}
              onDeleted={onRemoved}
              extraItems={
                !isAuthor && user
                  ? [
                      {
                        label: `Mute Stories from ${publisherLabel(story.publisher)}`,
                        onSelect: muteStories,
                      },
                    ]
                  : []
              }
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 space-y-2 p-3 transition-opacity",
          holding ? "opacity-0" : "opacity-100",
        )}
      >
        {story.caption ? (
          <p className="whitespace-pre-wrap text-sm text-white drop-shadow">
            {story.caption}
          </p>
        ) : null}
        <ContentCtaButton post={story} />
        <div className="flex items-center gap-2">
          {isAuthor ? (
            <span className="flex items-center gap-1 text-sm text-white">
              <IoEyeOutline aria-hidden />
              {engagement.counts.views.toLocaleString()} viewed
            </span>
          ) : null}
          {canReact ? (
            <div className="flex flex-1 items-center gap-1">
              {CONTENT_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => engagement.react(emoji)}
                  aria-label={`React ${emoji}`}
                  aria-pressed={engagement.reaction === emoji}
                  className={cn(
                    "rounded-full px-1.5 py-1 text-xl transition-transform hover:scale-110",
                    engagement.reaction === emoji && "bg-white/25",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {canComment ? (
            <button
              type="button"
              onClick={() => setCommentsOpen(true)}
              aria-label="Comments"
              className="rounded-full p-2 text-white hover:bg-white/10"
            >
              <IoChatbubbleOutline className="text-xl" />
            </button>
          ) : null}
          {program.storiesSharing ? (
            <button
              type="button"
              onClick={share}
              aria-label="Share"
              className="rounded-full p-2 text-white hover:bg-white/10"
            >
              <IoPaperPlaneOutline className="text-xl" />
            </button>
          ) : null}
        </div>
      </div>

      {commentsOpen ? (
        <ContentCommentsSheet
          postId={story.id}
          open
          onOpenChange={setCommentsOpen}
          commentsAllowed={canComment}
        />
      ) : null}
    </div>
  );
}
