import { logger } from "@abonten/core/logger";
import type { HighlightGroup } from "@abonten/types/highlightType";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SLIDE_DURATION = 3000;
const LONG_PRESS_DELAY = 500;
const MOVE_CANCEL_THRESHOLD = 10;
const SWIPE_THRESHOLD = 50;

type UseHighlightViewerParams = {
  groups: HighlightGroup[];
  initialGroupIndex: number;
  onClose: () => void;
};

type SwipeZone = "prev" | "next";

export function useHighlightViewer({
  groups,
  initialGroupIndex,
  onClose,
}: UseHighlightViewerParams) {
  const [localGroups, setLocalGroups] = useState<HighlightGroup[]>(groups);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(initialGroupIndex);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Tracks only the "finger currently down past the long-press threshold"
  // window on mobile — distinct from `isPaused`, which is also true for
  // desktop click-pause and while the 3-dot menu is open, neither of which
  // should hide the header.
  const [isLongPressHolding, setIsLongPressHolding] = useState(false);
  const [currentAnimationDuration, setCurrentAnimationDuration] =
    useState("3s");

  const videoRef = useRef<HTMLVideoElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimeout = useRef<NodeJS.Timeout | null>(null);
  const mediaStartTimeRef = useRef<number>(0);
  const mediaTimeElapsedOnPauseRef = useRef<number>(0);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);
  const gestureTypeRef = useRef<"pending" | "longpress" | "swipe">("pending");

  const currentGroup: HighlightGroup | null =
    localGroups[currentGroupIndex] ?? null;
  const currentSlide = currentGroup?.[currentIndex] ?? null;

  // Reset the loading state as soon as a new slide is selected, synchronously
  // during render (React's documented pattern for resetting state when a
  // derived value changes) rather than in an effect — this guarantees the
  // auto-advance effect below never observes a stale `isLoading: false` for
  // media that hasn't loaded yet.
  const lastSlideIdRef = useRef<string | null>(null);
  if (currentSlide && lastSlideIdRef.current !== currentSlide.id) {
    lastSlideIdRef.current = currentSlide.id;
    if (!isLoading) {
      setIsLoading(true);
    }
  }

  const goToAdjacentGroup = useCallback(
    (direction: "next" | "prev") => {
      mediaTimeElapsedOnPauseRef.current = 0;
      setIsPaused(false);

      if (direction === "next") {
        const nextGroupIdx = currentGroupIndex + 1;
        if (nextGroupIdx >= localGroups.length) {
          onClose();
          return;
        }
        setCurrentGroupIndex(nextGroupIdx);
        setCurrentIndex(0);
      } else {
        const prevGroupIdx = currentGroupIndex - 1;
        if (prevGroupIdx < 0) {
          onClose();
          return;
        }
        setCurrentGroupIndex(prevGroupIdx);
        setCurrentIndex(localGroups[prevGroupIdx].length - 1);
      }
    },
    [currentGroupIndex, localGroups, onClose],
  );

  const handleNextSlide = useCallback(() => {
    if (!currentGroup) return;
    mediaTimeElapsedOnPauseRef.current = 0;
    if (currentIndex >= currentGroup.length - 1) {
      goToAdjacentGroup("next");
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentGroup, currentIndex, goToAdjacentGroup]);

  const handlePreviousSlide = useCallback(() => {
    mediaTimeElapsedOnPauseRef.current = 0;
    if (currentIndex <= 0) {
      goToAdjacentGroup("prev");
    } else {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex, goToAdjacentGroup]);

  // Auto-advance / progress timer
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!currentGroup || !currentSlide) return;

    const mediaType = currentSlide.media_type;
    const currentMediaDuration =
      mediaType === "video"
        ? (currentSlide.media_duration ?? SLIDE_DURATION / 1000) * 1000
        : SLIDE_DURATION;

    setCurrentAnimationDuration(`${currentMediaDuration / 1000}s`);

    // Loading time must never count toward the viewing duration: don't
    // schedule the auto-advance timer (or record a start time) until the
    // media has actually signalled it's ready.
    if (isPaused || isLoading) {
      return;
    }

    const remainingTime =
      currentMediaDuration - mediaTimeElapsedOnPauseRef.current;
    mediaStartTimeRef.current = Date.now() - mediaTimeElapsedOnPauseRef.current;

    if (mediaType === "image") {
      timeoutRef.current = setTimeout(() => {
        mediaTimeElapsedOnPauseRef.current = 0;
        handleNextSlide();
      }, remainingTime);
    }
    // For videos, the <video onEnded> callback advances instead, to avoid
    // double progression.

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [currentGroup, currentSlide, isPaused, isLoading, handleNextSlide]);

  const pauseNow = useCallback(() => {
    if (
      videoRef.current &&
      currentSlide &&
      currentSlide.media_type === "video"
    ) {
      mediaTimeElapsedOnPauseRef.current = videoRef.current.currentTime * 1000;
      videoRef.current.pause();
    } else if (mediaStartTimeRef.current !== 0) {
      mediaTimeElapsedOnPauseRef.current = Math.max(
        0,
        Math.min(SLIDE_DURATION, Date.now() - mediaStartTimeRef.current),
      );
    } else {
      mediaTimeElapsedOnPauseRef.current = 0;
    }
    setIsPaused(true);
  }, [currentSlide]);

  const resumeNow = useCallback(() => {
    // Deliberately does NOT reset `mediaTimeElapsedOnPauseRef` — pauseNow()
    // just captured how far into the slide we were, and the auto-advance
    // effect below reads that value to compute the correct remaining time.
    // Zeroing it here would silently restart the slide's timer from full
    // duration on every resume, even though the visual progress bar (a CSS
    // animation) correctly continues from its paused position.
    if (
      videoRef.current &&
      currentSlide &&
      currentSlide.media_type === "video"
    ) {
      videoRef.current
        .play()
        .catch((error) => logger.debug("Video play failed:", error));
    }
    setIsPaused(false);
  }, [currentSlide]);

  const togglePause = useCallback(() => {
    if (isPaused) {
      resumeNow();
    } else {
      pauseNow();
    }
  }, [isPaused, pauseNow, resumeNow]);

  const handleMediaClick = useCallback(() => {
    togglePause();
  }, [togglePause]);

  const handleMediaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        togglePause();
      }
    },
    [togglePause],
  );

  // Mobile gesture classification: short tap -> slide nav, hold -> pause,
  // horizontal/vertical drag past threshold -> swipe (group nav / close).
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const touch = e.touches[0];
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
      gestureTypeRef.current = "pending";
      setIsLongPressHolding(false);

      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current);
      }
      longPressTimeout.current = setTimeout(() => {
        if (gestureTypeRef.current === "pending" && !isPaused) {
          gestureTypeRef.current = "longpress";
          pauseNow();
          setIsLongPressHolding(true);
        }
      }, LONG_PRESS_DELAY);
    },
    [isPaused, pauseNow],
  );

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    lastTouchPos.current = { x: touch.clientX, y: touch.clientY };

    if (!touchStartPos.current || gestureTypeRef.current !== "pending") {
      return;
    }

    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;

    if (
      Math.abs(dx) > MOVE_CANCEL_THRESHOLD ||
      Math.abs(dy) > MOVE_CANCEL_THRESHOLD
    ) {
      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current);
        longPressTimeout.current = null;
      }
      gestureTypeRef.current = "swipe";
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>, zone: SwipeZone) => {
      e.stopPropagation();
      // Without this, mobile browsers still fire a synthetic `click` event
      // shortly after touchend for any stationary touch (tap OR long-press-
      // then-release) since there was no meaningful finger movement. That
      // click bubbles past these tap-zone divs (which have no onClick) up to
      // the media wrapper's onClick={handleMediaClick}, re-toggling pause a
      // moment after this handler already resolved it correctly — the actual
      // cause of "release sometimes stays paused" and "tap also pauses".
      e.preventDefault();
      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current);
        longPressTimeout.current = null;
      }

      const gesture = gestureTypeRef.current;
      gestureTypeRef.current = "pending";

      if (gesture === "longpress") {
        resumeNow();
        setIsLongPressHolding(false);
        touchStartPos.current = null;
        return;
      }

      if (
        gesture === "swipe" &&
        touchStartPos.current &&
        lastTouchPos.current
      ) {
        const dx = lastTouchPos.current.x - touchStartPos.current.x;
        const dy = lastTouchPos.current.y - touchStartPos.current.y;
        touchStartPos.current = null;

        if (Math.abs(dy) > Math.abs(dx) && dy > SWIPE_THRESHOLD) {
          onClose();
          return;
        }
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
          goToAdjacentGroup(dx < 0 ? "next" : "prev");
          return;
        }
        // Ambiguous/aborted drag: intentionally do nothing.
        return;
      }

      touchStartPos.current = null;
      if (zone === "prev") {
        handlePreviousSlide();
      } else {
        handleNextSlide();
      }
    },
    [
      resumeNow,
      goToAdjacentGroup,
      handlePreviousSlide,
      handleNextSlide,
      onClose,
    ],
  );

  // Seeking to the resume position doesn't need the video to be playable yet
  // — it only needs metadata (duration/dimensions), which loads well before
  // playback can reliably begin.
  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = mediaTimeElapsedOnPauseRef.current / 1000;
    }
  }, []);

  // "canplay" (not "loadedmetadata") is the browser's own signal that enough
  // data has buffered to reliably begin playback — this is what clears the
  // loading state and starts the progress timer, keeping both in sync with
  // when the video actually becomes visible/audible.
  const handleVideoCanPlay = useCallback(() => {
    setIsLoading(false);
    if (videoRef.current && !isPaused) {
      videoRef.current
        .play()
        .catch((error) => logger.debug("Video play failed on canplay:", error));
    }
  }, [isPaused]);

  useEffect(() => {
    if (
      videoRef.current &&
      currentSlide?.media_type === "video" &&
      !isLoading
    ) {
      if (isPaused) {
        videoRef.current.pause();
      } else {
        videoRef.current
          .play()
          .catch((error) =>
            logger.debug("Video play failed in useEffect:", error),
          );
      }
    }
  }, [isPaused, currentSlide, isLoading]);

  // Owner-only slide deletion: removes the row locally and moves to the
  // next/previous slide, an adjacent group, or closes the viewer, matching
  // the current slide's neighbors rather than waiting on a server refetch.
  //
  // The new groups are computed from the current `localGroups` value up
  // front, then applied with plain, sequential setState calls (never a
  // setState *updater* function) so `onClose` — which sets state on the
  // parent `UserHighlights` component — is only ever called from this plain
  // event-handler-triggered function body, matching how `goToAdjacentGroup`
  // above already calls it safely. Calling it from inside a
  // `setLocalGroups((prev) => ...)` updater is unsafe: React can invoke that
  // updater while rendering this component, so updating a *different*
  // component's state from within it triggers React's
  // "Cannot update a component while rendering a different component" error.
  const removeSlide = useCallback(
    (slideId: string) => {
      mediaTimeElapsedOnPauseRef.current = 0;
      setIsPaused(false);

      const group = localGroups[currentGroupIndex];
      if (!group) return;

      const slideIdx = group.findIndex((s) => s.id === slideId);
      if (slideIdx === -1) return;

      const originalLength = group.length;
      const newGroup = group.filter((s) => s.id !== slideId);
      const newGroups = [...localGroups];

      if (newGroup.length === 0) {
        newGroups.splice(currentGroupIndex, 1);
        setLocalGroups(newGroups);

        if (newGroups.length === 0) {
          onClose();
          return;
        }

        if (currentGroupIndex >= newGroups.length) {
          const newIdx = newGroups.length - 1;
          setCurrentGroupIndex(newIdx);
          setCurrentIndex(newGroups[newIdx].length - 1);
        } else {
          setCurrentIndex(0);
        }
        return;
      }

      newGroups[currentGroupIndex] = newGroup;
      setLocalGroups(newGroups);

      if (slideIdx >= originalLength - 1) {
        setCurrentIndex(newGroup.length - 1);
      }
      // else: the next slide now occupies this same index already.
    },
    [currentGroupIndex, localGroups, onClose],
  );

  const progressBars = useMemo(() => currentGroup ?? [], [currentGroup]);

  return {
    currentGroup,
    currentGroupIndex,
    currentIndex,
    currentSlide,
    progressBars,
    isPaused,
    isLoading,
    setIsLoading,
    isLongPressHolding,
    currentAnimationDuration,
    videoRef,
    handleNextSlide,
    handlePreviousSlide,
    handleMediaClick,
    handleMediaKeyDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleVideoLoadedMetadata,
    handleVideoCanPlay,
    removeSlide,
    pause: pauseNow,
    resume: resumeNow,
  };
}
