"use client";

import { getStorySequence } from "@/actions/content/getStorySequence";
import { sendStoryReply } from "@/actions/content/sendStoryReply";
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
  ContentReactionEmoji,
} from "@abonten/types/contentType";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IoArrowUp,
  IoCheckmarkCircle,
  IoClose,
  IoEyeOutline,
  IoHeart,
  IoHeartOutline,
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
import FollowButton from "../molecules/FollowButton";

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
    onClose();
    // The last Story reports its view as it unmounts, so send the batch on
    // the next tick, then refresh the tray so its ring turns seen.
    setTimeout(() => {
      flushContentViews().finally(() => {
        qc.invalidateQueries({ queryKey: ["content", "stories", "tray"] });
      });
    }, 0);
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
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [sent, setSent] = useState<{
    conversationId: string;
    label: string;
  } | null>(null);
  const replyInput = useRef<HTMLInputElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHold = useRef(false);

  const media = story.media[mediaIndex] ?? story.media[0];
  const isVideo = media?.type === "video";
  const paused = userPaused || holding || menuOpen || replying || !loaded;
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
      // Typing a reply must not page or pause the Story.
      if (replying || menuOpen) return;
      if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === " ") {
        e.preventDefault();
        setUserPaused((v) => !v);
      } else if (e.key.toLowerCase() === "m") setMuted(!muted);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replying, menuOpen, muted, onNext, onPrev, setMuted]);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(null), 3200);
    return () => clearTimeout(t);
  }, [sent]);

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

  // Replies and reactions are private messages to the publisher, sent
  // without leaving the Story (sendStoryReply → Messages).
  const repliesPossible =
    !isAuthor && story.publisher.kind !== "abonten" && program.stories;
  const canReact = repliesPossible && !!user && program.storiesReactions;
  const canReply =
    repliesPossible && program.storiesComments && story.allowComments;

  const replyAttempt = useRef<{ text: string; id: string } | null>(null);
  const sendReplyText = async () => {
    const text = draft.trim();
    if (!text || replySending) return;
    if (replyAttempt.current?.text !== text) {
      replyAttempt.current = { text, id: crypto.randomUUID() };
    }
    setReplySending(true);
    try {
      const res = await sendStoryReply({
        postId: story.id,
        kind: "text",
        content: text,
        clientGeneratedId: replyAttempt.current.id,
      });
      const data = dataOf(res);
      if (!data) {
        toast.error(messageOf(res, "Couldn't send your reply."));
        return;
      }
      replyAttempt.current = null;
      setDraft("");
      replyInput.current?.blur();
      setSent({ conversationId: data.conversationId, label: "Reply sent" });
    } catch {
      toast.error("No connection. Your reply wasn't sent.");
    } finally {
      setReplySending(false);
    }
  };

  const sendReaction = async (emoji: ContentReactionEmoji) => {
    if (engagement.reaction === emoji) {
      // The same emoji again takes the reaction back; nothing is messaged.
      engagement.react(emoji);
      return;
    }
    const res = await sendStoryReply({
      postId: story.id,
      kind: "reaction",
      content: emoji,
      clientGeneratedId: crypto.randomUUID(),
    });
    const data = dataOf(res);
    if (!data) {
      toast.error(messageOf(res, "Couldn't send your reaction."));
      return;
    }
    engagement.setReaction(emoji);
    setSent({ conversationId: data.conversationId, label: "Reaction sent" });
  };

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
            {!isAuthor &&
            !story.viewer.following &&
            story.publisher.kind !== "abonten" ? (
              <FollowButton
                kind={story.publisher.kind === "place" ? "place" : "organizer"}
                targetId={story.publisher.id}
                ownerId={story.publisher.ownerId ?? story.authorId}
                label={story.publisher.name}
                known={story.viewer.following}
                variant="overlay"
                className="mr-1 px-2.5 py-1 text-xs"
              />
            ) : null}
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
        {sent ? (
          <div
            aria-live="polite"
            className="mx-auto flex w-fit items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-black shadow"
          >
            <IoCheckmarkCircle className="text-primary" aria-hidden />
            {sent.label}
            <Link
              href={`/messages/${sent.conversationId}`}
              onClick={onClose}
              className="font-bold text-primary hover:underline"
            >
              View chat
            </Link>
          </div>
        ) : null}
        {replying && canReact ? (
          <div className="flex justify-between px-1">
            {CONTENT_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                // Keep the reply field focused while picking a reaction.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => sendReaction(emoji)}
                aria-label={`React ${emoji}`}
                aria-pressed={engagement.reaction === emoji}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full text-2xl transition-transform hover:scale-110",
                  engagement.reaction === emoji && "bg-white/25",
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          {isAuthor ? (
            <span className="flex flex-1 items-center gap-1 text-sm text-white">
              <IoEyeOutline aria-hidden />
              {engagement.counts.views.toLocaleString()} viewed
            </span>
          ) : repliesPossible ? (
            canReply ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendReplyText();
                }}
              >
                <input
                  ref={replyInput}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onFocus={() => {
                    if (!user) {
                      replyInput.current?.blur();
                      toast.error("Sign in to reply to Stories.");
                      return;
                    }
                    setReplying(true);
                  }}
                  onBlur={() => setReplying(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") replyInput.current?.blur();
                  }}
                  maxLength={1000}
                  placeholder={`Reply to ${publisherLabel(story.publisher)}…`}
                  aria-label={`Reply privately to ${publisherLabel(story.publisher)}`}
                  className={cn(
                    "h-11 min-w-0 flex-1 rounded-full border bg-black/30 px-4 text-sm text-white outline-none placeholder:text-white/75",
                    replying ? "border-white" : "border-white/60",
                  )}
                />
                {draft.trim() ? (
                  <button
                    type="submit"
                    disabled={replySending}
                    // Submit without the blur swallowing the click.
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="Send reply"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black disabled:opacity-60"
                  >
                    {replySending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <IoArrowUp className="text-lg" />
                    )}
                  </button>
                ) : canReact ? (
                  <button
                    type="button"
                    onClick={() => sendReaction("❤️")}
                    aria-label={
                      engagement.reaction === "❤️"
                        ? "Remove your heart"
                        : "Send a heart"
                    }
                    aria-pressed={engagement.reaction === "❤️"}
                    className="rounded-full p-2 text-white hover:bg-white/10"
                  >
                    {engagement.reaction === "❤️" ? (
                      <IoHeart className="text-2xl text-rose-500" />
                    ) : (
                      <IoHeartOutline className="text-2xl" />
                    )}
                  </button>
                ) : null}
              </form>
            ) : (
              <span className="flex h-11 flex-1 items-center rounded-full border border-white/30 px-4 text-sm text-white/70">
                Replies are off for this Story
              </span>
            )
          ) : (
            <div className="flex-1" />
          )}
          {program.storiesSharing && !replying ? (
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
    </div>
  );
}
